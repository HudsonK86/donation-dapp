// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DonationEscrow
 * @dev A smart contract that acts as an escrow for donation campaigns.
 *      Funds are held until the campaign target is reached, then automatically
 *      released to the beneficiary wallet.
 */
contract DonationEscrow is Ownable, ReentrancyGuard {
    // ============================================================
    //                        DATA STRUCTURES
    // ============================================================

    struct Campaign {
        uint256 campaignId;
        address admin;
        address payable beneficiary;
        uint256 targetAmount;
        uint256 totalDonated;
        uint256 deadline;
        bool isActive;
        bool isReleased;
        bool isCancelled;
    }

    // ============================================================
    //                        STATE VARIABLES
    // ============================================================

    /// @dev Auto-incrementing campaign ID counter
    uint256 private _nextCampaignId;

    /// @dev Mapping from campaign ID to Campaign struct
    mapping(uint256 => Campaign) public campaigns;

    // ============================================================
    //                           EVENTS
    // ============================================================

    /// @dev Emitted when a new campaign is created
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed admin,
        address indexed beneficiary,
        uint256 targetAmount,
        uint256 deadline
    );

    /// @dev Emitted when a donation is received for a campaign
    event DonationReceived(
        uint256 indexed campaignId,
        address indexed donor,
        uint256 amount,
        uint256 totalDonated
    );

    /// @dev Emitted when funds are automatically released to the beneficiary
    event FundsReleased(
        uint256 indexed campaignId,
        address indexed beneficiary,
        uint256 totalAmount
    );

    /// @dev Emitted when campaign terms are updated before any donation is received
    event CampaignUpdated(
        uint256 indexed campaignId,
        address indexed beneficiary,
        uint256 targetAmount,
        uint256 deadline
    );

    /// @dev Emitted when a campaign is cancelled before any donation is received
    event CampaignCancelled(
        uint256 indexed campaignId,
        address indexed admin
    );

    // ============================================================
    //                          ERRORS
    // ============================================================

    error CampaignNotFound(uint256 campaignId);
    error CampaignNotActive(uint256 campaignId);
    error CampaignAlreadyReleased(uint256 campaignId);
    error CampaignExpired(uint256 campaignId);
    error InvalidBeneficiary();
    error InvalidTargetAmount();
    error DonationAmountZero();
    error NotCampaignAdmin(uint256 campaignId);
    error CampaignHasDonations(uint256 campaignId);
    error CampaignCancelledError(uint256 campaignId);

    // ============================================================
    //                        CONSTRUCTOR
    // ============================================================

    constructor() Ownable(msg.sender) {
        _nextCampaignId = 0;
    }

    // ============================================================
    //                      RECEIVE / FALLBACK
    // ============================================================

    /**
     * @dev Explicit receive function so wallet simulators (`eth_call` /
     *      `eth_estimateGas`) get a real revert reason instead of a generic
     *      "unrecognized selector" failure. Without this, MetaMask shows
     *      the transaction as failed even when the actual send succeeds.
     *      All donations must go through `donateToCampaign`.
     */
    receive() external payable {
        revert("Use donateToCampaign(uint256) to donate");
    }

    // ============================================================
    //                      WRITE FUNCTIONS
    // ============================================================

    /**
     * @dev Creates a new donation campaign.
     * @param _beneficiary The wallet address that will receive funds when the target is reached.
     * @param _targetAmount The funding target in wei.
     * @param _deadline The unix timestamp after which the campaign expires.
     * @return campaignId The ID of the newly created campaign.
     */
    function createCampaign(
        address payable _beneficiary,
        uint256 _targetAmount,
        uint256 _deadline
    ) external returns (uint256) {
        if (_beneficiary == address(0)) revert InvalidBeneficiary();
        if (_targetAmount == 0) revert InvalidTargetAmount();
        require(_deadline > block.timestamp, "Deadline must be in the future");

        uint256 campaignId = _nextCampaignId;
        _nextCampaignId++;

        campaigns[campaignId] = Campaign({
            campaignId: campaignId,
            admin: msg.sender,
            beneficiary: _beneficiary,
            targetAmount: _targetAmount,
            totalDonated: 0,
            deadline: _deadline,
            isActive: true,
            isReleased: false,
            isCancelled: false
        });

        emit CampaignCreated(campaignId, msg.sender, _beneficiary, _targetAmount, _deadline);

        return campaignId;
    }

    /**
     * @dev Donates ETH to a specific campaign. If the donation causes the total
     *      to reach or exceed the target amount, funds are automatically released
     *      to the beneficiary.
     * @param _campaignId The ID of the campaign to donate to.
     */
    function donateToCampaign(uint256 _campaignId) external payable nonReentrant {
        Campaign storage campaign = campaigns[_campaignId];

        if (campaign.targetAmount == 0) revert CampaignNotFound(_campaignId);
        if (!campaign.isActive) revert CampaignNotActive(_campaignId);
        if (campaign.isReleased) revert CampaignAlreadyReleased(_campaignId);
        if (campaign.isCancelled) revert CampaignCancelledError(_campaignId);
        if (block.timestamp > campaign.deadline) revert CampaignExpired(_campaignId);
        if (msg.value == 0) revert DonationAmountZero();

        campaign.totalDonated += msg.value;

        emit DonationReceived(
            _campaignId,
            msg.sender,
            msg.value,
            campaign.totalDonated
        );

        // Auto-release funds when target is reached
        if (campaign.totalDonated >= campaign.targetAmount) {
            campaign.isActive = false;
            campaign.isReleased = true;

            uint256 totalAmount = campaign.totalDonated;

            // Transfer all funds to the beneficiary
            (bool success, ) = campaign.beneficiary.call{value: totalAmount}("");
            require(success, "Transfer to beneficiary failed");

            emit FundsReleased(_campaignId, campaign.beneficiary, totalAmount);
        }
    }

    /**
     * @dev Claim funds if the deadline has passed, regardless of the target amount.
     *      Can be called by anyone, but sends funds to the beneficiary.
     * @param _campaignId The ID of the campaign to claim.
     */
    function claimFunds(uint256 _campaignId) external nonReentrant {
        Campaign storage campaign = campaigns[_campaignId];

        if (campaign.targetAmount == 0) revert CampaignNotFound(_campaignId);
        if (!campaign.isActive) revert CampaignNotActive(_campaignId);
        if (campaign.isReleased) revert CampaignAlreadyReleased(_campaignId);
        if (campaign.isCancelled) revert CampaignCancelledError(_campaignId);
        require(block.timestamp > campaign.deadline, "Deadline has not passed yet");
        require(campaign.totalDonated > 0, "No funds to claim");

        campaign.isActive = false;
        campaign.isReleased = true;

        uint256 totalAmount = campaign.totalDonated;

        // Transfer all funds to the beneficiary
        (bool success, ) = campaign.beneficiary.call{value: totalAmount}("");
        require(success, "Transfer to beneficiary failed");

        emit FundsReleased(_campaignId, campaign.beneficiary, totalAmount);
    }

    /**
     * @dev Updates campaign terms before any donation is received.
     *      Once donors commit funds, beneficiary, target, and deadline are locked.
     * @param _campaignId The ID of the campaign to update.
     * @param _beneficiary The new beneficiary wallet address.
     * @param _targetAmount The new funding target in wei.
     * @param _deadline The new unix timestamp after which the campaign expires.
     */
    function updateCampaignTerms(
        uint256 _campaignId,
        address payable _beneficiary,
        uint256 _targetAmount,
        uint256 _deadline
    ) external {
        Campaign storage campaign = campaigns[_campaignId];

        if (campaign.targetAmount == 0) revert CampaignNotFound(_campaignId);
        if (msg.sender != campaign.admin) revert NotCampaignAdmin(_campaignId);
        if (!campaign.isActive) revert CampaignNotActive(_campaignId);
        if (campaign.isReleased) revert CampaignAlreadyReleased(_campaignId);
        if (campaign.isCancelled) revert CampaignCancelledError(_campaignId);
        if (campaign.totalDonated > 0) revert CampaignHasDonations(_campaignId);
        if (_beneficiary == address(0)) revert InvalidBeneficiary();
        if (_targetAmount == 0) revert InvalidTargetAmount();
        require(_deadline > block.timestamp, "Deadline must be in the future");

        campaign.beneficiary = _beneficiary;
        campaign.targetAmount = _targetAmount;
        campaign.deadline = _deadline;

        emit CampaignUpdated(_campaignId, _beneficiary, _targetAmount, _deadline);
    }

    /**
     * @dev Cancels a campaign before any donation is received.
     *      Campaigns with donations must follow the escrow release/refund rules.
     * @param _campaignId The ID of the campaign to cancel.
     */
    function cancelCampaign(uint256 _campaignId) external {
        Campaign storage campaign = campaigns[_campaignId];

        if (campaign.targetAmount == 0) revert CampaignNotFound(_campaignId);
        if (msg.sender != campaign.admin) revert NotCampaignAdmin(_campaignId);
        if (!campaign.isActive) revert CampaignNotActive(_campaignId);
        if (campaign.isReleased) revert CampaignAlreadyReleased(_campaignId);
        if (campaign.isCancelled) revert CampaignCancelledError(_campaignId);
        if (campaign.totalDonated > 0) revert CampaignHasDonations(_campaignId);

        campaign.isActive = false;
        campaign.isCancelled = true;

        emit CampaignCancelled(_campaignId, msg.sender);
    }

    // ============================================================
    //                       VIEW FUNCTIONS
    // ============================================================

    /**
     * @dev Returns the details of a specific campaign.
     * @param _campaignId The ID of the campaign.
     * @return campaign The Campaign struct.
     */
    function getCampaign(uint256 _campaignId) external view returns (Campaign memory) {
        if (campaigns[_campaignId].targetAmount == 0 && _campaignId >= _nextCampaignId) {
            revert CampaignNotFound(_campaignId);
        }
        return campaigns[_campaignId];
    }

    /**
     * @dev Returns the total number of campaigns created.
     * @return count The number of campaigns.
     */
    function getCampaignCount() external view returns (uint256) {
        return _nextCampaignId;
    }
}
