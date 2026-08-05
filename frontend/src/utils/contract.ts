// DonationEscrow contract ABI
// This ABI is extracted from the compiled Solidity contract.
// After running `npx hardhat compile` in the backend, the full ABI is in:
//   backend/artifacts/contracts/DonationEscrow.sol/DonationEscrow.json
//
// For now, we define the ABI manually to match the contract interface.

export const DONATION_ESCROW_ABI = [
  // ============================================================
  //                      WRITE FUNCTIONS
  // ============================================================
  {
    type: "function",
    name: "createCampaign",
    inputs: [
      { name: "_beneficiary", type: "address", internalType: "address payable" },
      { name: "_targetAmount", type: "uint256", internalType: "uint256" },
      { name: "_deadline", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimFunds",
    inputs: [
      { name: "_campaignId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "donateToCampaign",
    inputs: [
      { name: "_campaignId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "payable",
  },

  // ============================================================
  //                      VIEW FUNCTIONS
  // ============================================================
  {
    type: "function",
    name: "getCampaign",
    inputs: [
      { name: "_campaignId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct DonationEscrow.Campaign",
        components: [
          { name: "campaignId", type: "uint256", internalType: "uint256" },
          { name: "admin", type: "address", internalType: "address" },
          { name: "beneficiary", type: "address", internalType: "address payable" },
          { name: "targetAmount", type: "uint256", internalType: "uint256" },
          { name: "totalDonated", type: "uint256", internalType: "uint256" },
          { name: "deadline", type: "uint256", internalType: "uint256" },
          { name: "isActive", type: "bool", internalType: "bool" },
          { name: "isReleased", type: "bool", internalType: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCampaignCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "campaigns",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "campaignId", type: "uint256", internalType: "uint256" },
      { name: "admin", type: "address", internalType: "address" },
      { name: "beneficiary", type: "address", internalType: "address payable" },
      { name: "targetAmount", type: "uint256", internalType: "uint256" },
      { name: "totalDonated", type: "uint256", internalType: "uint256" },
      { name: "deadline", type: "uint256", internalType: "uint256" },
      { name: "isActive", type: "bool", internalType: "bool" },
      { name: "isReleased", type: "bool", internalType: "bool" },
    ],
    stateMutability: "view",
  },

  // ============================================================
  //                          EVENTS
  // ============================================================
  {
    type: "event",
    name: "CampaignCreated",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "admin", type: "address", indexed: true, internalType: "address" },
      { name: "beneficiary", type: "address", indexed: true, internalType: "address" },
      { name: "targetAmount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "deadline", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DonationReceived",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "donor", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "totalDonated", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "FundsReleased",
    inputs: [
      { name: "campaignId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "beneficiary", type: "address", indexed: true, internalType: "address" },
      { name: "totalAmount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },

  // ============================================================
  //                         ERRORS
  // ============================================================
  { type: "error", name: "CampaignNotFound", inputs: [{ name: "campaignId", type: "uint256" }] },
  { type: "error", name: "CampaignNotActive", inputs: [{ name: "campaignId", type: "uint256" }] },
  { type: "error", name: "CampaignAlreadyReleased", inputs: [{ name: "campaignId", type: "uint256" }] },
  { type: "error", name: "CampaignExpired", inputs: [{ name: "campaignId", type: "uint256" }] },
  { type: "error", name: "InvalidBeneficiary", inputs: [] },
  { type: "error", name: "InvalidTargetAmount", inputs: [] },
  { type: "error", name: "DonationAmountZero", inputs: [] },
] as const;
