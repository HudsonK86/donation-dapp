import { expect } from "chai";
import { beforeEach, describe, it } from "node:test";
import { parseEther, zeroAddress } from "viem";
import {
  createHardhatRuntimeEnvironment,
  importUserConfig,
  resolveHardhatConfigPath,
} from "hardhat/hre";

const hreConfig = await importUserConfig(await resolveHardhatConfigPath());
const hre = await createHardhatRuntimeEnvironment(hreConfig);
const { network } = hre;

describe("DonationEscrow", function () {
  let viem: any;
  let escrow: any;
  let owner: any;
  let admin: any;
  let donor1: any;
  let donor2: any;
  let beneficiary: any;
  let publicClient: any;
  let networkHelpers: any;

  const TARGET_AMOUNT = parseEther("10");
  const DEADLINE = 9999999999n;

  beforeEach(async function () {
    const conn = await network.connect();
    viem = conn.viem;
    networkHelpers = conn.networkHelpers;
    publicClient = await viem.getPublicClient();
    const clients = await viem.getWalletClients();
    owner = clients[0];
    admin = clients[1];
    donor1 = clients[2];
    donor2 = clients[3];
    beneficiary = clients[4];

    escrow = await viem.deployContract("DonationEscrow");
  });

  async function expectRevert(promise: Promise<any>, errorName: string) {
    try {
      await promise;
      expect.fail("Expected transaction to revert");
    } catch (err: any) {
      expect(err.message).to.include(errorName);
    }
  }

  describe("createCampaign", function () {
    it("should create a campaign and emit CampaignCreated event", async function () {
      const hash = await escrow.write.createCampaign(
        [beneficiary.account.address, TARGET_AMOUNT, DEADLINE],
        { account: admin.account }
      );
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal("success");

      const campaign = await escrow.read.getCampaign([0n]);
      expect(campaign.admin.toLowerCase()).to.equal(admin.account.address.toLowerCase());
      expect(campaign.beneficiary.toLowerCase()).to.equal(beneficiary.account.address.toLowerCase());
      expect(campaign.targetAmount).to.equal(TARGET_AMOUNT);
      expect(campaign.totalDonated).to.equal(0n);
      expect(campaign.deadline).to.equal(DEADLINE);
      expect(campaign.isActive).to.be.true;
      expect(campaign.isReleased).to.be.false;
    });

    it("should increment campaign IDs", async function () {
      await escrow.write.createCampaign([beneficiary.account.address, TARGET_AMOUNT, DEADLINE], { account: admin.account });
      await escrow.write.createCampaign([beneficiary.account.address, TARGET_AMOUNT, DEADLINE], { account: admin.account });

      const count = await escrow.read.getCampaignCount();
      expect(count).to.equal(2n);
    });

    it("should revert if beneficiary is zero address", async function () {
      await expectRevert(
        escrow.write.createCampaign([zeroAddress, TARGET_AMOUNT, DEADLINE], { account: admin.account }),
        "InvalidBeneficiary"
      );
    });

    it("should revert if target amount is zero", async function () {
      await expectRevert(
        escrow.write.createCampaign([beneficiary.account.address, 0n, DEADLINE], { account: admin.account }),
        "InvalidTargetAmount"
      );
    });

    it("should revert if the deadline is not in the future", async function () {
      const currentTimestamp = BigInt(await networkHelpers.time.latest());

      await expectRevert(
        escrow.write.createCampaign(
          [beneficiary.account.address, TARGET_AMOUNT, currentTimestamp],
          { account: admin.account }
        ),
        "Deadline must be in the future"
      );
    });
  });

  describe("donateToCampaign", function () {
    beforeEach(async function () {
      await escrow.write.createCampaign([beneficiary.account.address, TARGET_AMOUNT, DEADLINE], { account: admin.account });
    });

    it("should accept a donation and emit DonationReceived event", async function () {
      const donationAmount = parseEther("2");

      const hash = await escrow.write.donateToCampaign(
        [0n],
        { account: donor1.account, value: donationAmount }
      );
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal("success");

      const campaign = await escrow.read.getCampaign([0n]);
      expect(campaign.totalDonated).to.equal(donationAmount);
      expect(campaign.isActive).to.be.true;
    });

    it("should accumulate donations from multiple donors", async function () {
      const amount1 = parseEther("3");
      const amount2 = parseEther("4");

      await escrow.write.donateToCampaign([0n], { account: donor1.account, value: amount1 });
      await escrow.write.donateToCampaign([0n], { account: donor2.account, value: amount2 });

      const campaign = await escrow.read.getCampaign([0n]);
      expect(campaign.totalDonated).to.equal(amount1 + amount2);
    });

    it("should revert if donation amount is zero", async function () {
      await expectRevert(
        escrow.write.donateToCampaign([0n], { account: donor1.account, value: 0n }),
        "DonationAmountZero"
      );
    });

    it("should revert for non-existent campaign", async function () {
      await expectRevert(
        escrow.write.donateToCampaign([999n], { account: donor1.account, value: parseEther("1") }),
        "CampaignNotFound"
      );
    });

    it("should reject donations after the campaign deadline", async function () {
      const currentTimestamp = BigInt(await networkHelpers.time.latest());
      const shortDeadline = currentTimestamp + 100n;

      await escrow.write.createCampaign(
        [beneficiary.account.address, TARGET_AMOUNT, shortDeadline],
        { account: admin.account }
      );
      await networkHelpers.time.increaseTo(shortDeadline + 1n);

      await expectRevert(
        escrow.write.donateToCampaign([1n], {
          account: donor1.account,
          value: parseEther("1"),
        }),
        "CampaignExpired"
      );
    });
  });

  describe("Auto-release when target is reached", function () {
    const smallTarget = parseEther("5");

    beforeEach(async function () {
      await escrow.write.createCampaign([beneficiary.account.address, smallTarget, DEADLINE], { account: admin.account });
    });

    it("should release funds to beneficiary when target is exactly met", async function () {
      const beneficiaryBalanceBefore = await publicClient.getBalance({ address: beneficiary.account.address });

      const hash = await escrow.write.donateToCampaign(
        [0n],
        { account: donor1.account, value: smallTarget }
      );
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal("success");

      const campaign = await escrow.read.getCampaign([0n]);
      expect(campaign.isActive).to.be.false;
      expect(campaign.isReleased).to.be.true;

      const beneficiaryBalanceAfter = await publicClient.getBalance({ address: beneficiary.account.address });
      expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(smallTarget);
    });

    it("should release funds when target is exceeded", async function () {
      const overAmount = parseEther("7");

      const hash = await escrow.write.donateToCampaign(
        [0n],
        { account: donor1.account, value: overAmount }
      );
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal("success");

      const campaign = await escrow.read.getCampaign([0n]);
      expect(campaign.isActive).to.be.false;
      expect(campaign.isReleased).to.be.true;
    });

    it("should release funds when target is met across multiple donations", async function () {
      await escrow.write.donateToCampaign([0n], { account: donor1.account, value: parseEther("3") });

      const hash = await escrow.write.donateToCampaign([0n], { account: donor2.account, value: parseEther("2") });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal("success");

      const campaign = await escrow.read.getCampaign([0n]);
      expect(campaign.isActive).to.be.false;
      expect(campaign.isReleased).to.be.true;
    });

    it("should reject donations after campaign is released", async function () {
      await escrow.write.donateToCampaign([0n], { account: donor1.account, value: smallTarget });

      await expectRevert(
        escrow.write.donateToCampaign([0n], { account: donor2.account, value: parseEther("1") }),
        "CampaignNotActive"
      );
    });
  });

  describe("claimFunds", function () {
    let shortDeadline: bigint;

    beforeEach(async function () {
      const currentTimestamp = BigInt(await networkHelpers.time.latest());
      shortDeadline = currentTimestamp + 100n;

      await escrow.write.createCampaign(
        [beneficiary.account.address, TARGET_AMOUNT, shortDeadline],
        { account: admin.account }
      );
    });

    it("should release donated funds to the beneficiary after the deadline", async function () {
      const donationAmount = parseEther("3");
      await escrow.write.donateToCampaign([0n], {
        account: donor1.account,
        value: donationAmount,
      });

      const beneficiaryBalanceBefore = await publicClient.getBalance({
        address: beneficiary.account.address,
      });
      await networkHelpers.time.increaseTo(shortDeadline + 1n);

      const hash = await escrow.write.claimFunds([0n], {
        account: beneficiary.account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal("success");

      const campaign = await escrow.read.getCampaign([0n]);
      expect(campaign.isActive).to.be.false;
      expect(campaign.isReleased).to.be.true;

      const beneficiaryBalanceAfter = await publicClient.getBalance({
        address: beneficiary.account.address,
      });
      expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.equal(
        donationAmount - receipt.gasUsed * receipt.effectiveGasPrice
      );
    });

    it("should reject a claim before the deadline", async function () {
      await escrow.write.donateToCampaign([0n], {
        account: donor1.account,
        value: parseEther("1"),
      });

      await expectRevert(
        escrow.write.claimFunds([0n], { account: beneficiary.account }),
        "Deadline has not passed yet"
      );
    });

    it("should reject a claim when no funds were donated", async function () {
      await networkHelpers.time.increaseTo(shortDeadline + 1n);

      await expectRevert(
        escrow.write.claimFunds([0n], { account: beneficiary.account }),
        "No funds to claim"
      );
    });

    it("should reject a second claim after funds are released", async function () {
      await escrow.write.donateToCampaign([0n], {
        account: donor1.account,
        value: parseEther("1"),
      });
      await networkHelpers.time.increaseTo(shortDeadline + 1n);
      await escrow.write.claimFunds([0n], { account: beneficiary.account });

      await expectRevert(
        escrow.write.claimFunds([0n], { account: beneficiary.account }),
        "CampaignNotActive"
      );
    });

    it("should reject a claim by a non-beneficiary account", async function () {
      await escrow.write.donateToCampaign([0n], {
        account: donor1.account,
        value: parseEther("1"),
      });
      await networkHelpers.time.increaseTo(shortDeadline + 1n);

      await expectRevert(
        escrow.write.claimFunds([0n], { account: donor2.account }),
        "NotBeneficiary"
      );
    });
  });

  describe("updateCampaignTerms", function () {
    beforeEach(async function () {
      await escrow.write.createCampaign(
        [beneficiary.account.address, TARGET_AMOUNT, DEADLINE],
        { account: admin.account }
      );
    });

    it("should allow the campaign administrator to update terms before donations", async function () {
      const newTarget = parseEther("20");
      const newDeadline = DEADLINE - 1n;

      const hash = await escrow.write.updateCampaignTerms(
        [0n, donor2.account.address, newTarget, newDeadline],
        { account: admin.account }
      );
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal("success");

      const campaign = await escrow.read.getCampaign([0n]);
      expect(campaign.beneficiary.toLowerCase()).to.equal(
        donor2.account.address.toLowerCase()
      );
      expect(campaign.targetAmount).to.equal(newTarget);
      expect(campaign.deadline).to.equal(newDeadline);
    });

    it("should reject an update by a non-administrator", async function () {
      await expectRevert(
        escrow.write.updateCampaignTerms(
          [0n, donor2.account.address, TARGET_AMOUNT, DEADLINE - 1n],
          { account: donor1.account }
        ),
        "NotCampaignAdmin"
      );
    });

    it("should reject an update after a donation has been received", async function () {
      await escrow.write.donateToCampaign([0n], {
        account: donor1.account,
        value: parseEther("1"),
      });

      await expectRevert(
        escrow.write.updateCampaignTerms(
          [0n, donor2.account.address, TARGET_AMOUNT, DEADLINE - 1n],
          { account: admin.account }
        ),
        "CampaignHasDonations"
      );
    });

    it("should reject an invalid beneficiary", async function () {
      await expectRevert(
        escrow.write.updateCampaignTerms(
          [0n, zeroAddress, TARGET_AMOUNT, DEADLINE - 1n],
          { account: admin.account }
        ),
        "InvalidBeneficiary"
      );
    });

    it("should reject a zero target amount", async function () {
      await expectRevert(
        escrow.write.updateCampaignTerms(
          [0n, beneficiary.account.address, 0n, DEADLINE - 1n],
          { account: admin.account }
        ),
        "InvalidTargetAmount"
      );
    });

    it("should reject a deadline that is not in the future", async function () {
      const currentTimestamp = BigInt(await networkHelpers.time.latest());

      await expectRevert(
        escrow.write.updateCampaignTerms(
          [0n, beneficiary.account.address, TARGET_AMOUNT, currentTimestamp],
          { account: admin.account }
        ),
        "Deadline must be in the future"
      );
    });
  });

  describe("cancelCampaign", function () {
    beforeEach(async function () {
      await escrow.write.createCampaign(
        [beneficiary.account.address, TARGET_AMOUNT, DEADLINE],
        { account: admin.account }
      );
    });

    it("should allow the administrator to cancel a campaign before donations", async function () {
      const hash = await escrow.write.cancelCampaign([0n], {
        account: admin.account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal("success");

      const campaign = await escrow.read.getCampaign([0n]);
      expect(campaign.isActive).to.be.false;
      expect(campaign.isCancelled).to.be.true;
      expect(campaign.isReleased).to.be.false;
    });

    it("should reject cancellation by a non-administrator", async function () {
      await expectRevert(
        escrow.write.cancelCampaign([0n], { account: donor1.account }),
        "NotCampaignAdmin"
      );
    });

    it("should reject cancellation after a donation has been received", async function () {
      await escrow.write.donateToCampaign([0n], {
        account: donor1.account,
        value: parseEther("1"),
      });

      await expectRevert(
        escrow.write.cancelCampaign([0n], { account: admin.account }),
        "CampaignHasDonations"
      );
    });

    it("should reject donations to a cancelled campaign", async function () {
      await escrow.write.cancelCampaign([0n], { account: admin.account });

      await expectRevert(
        escrow.write.donateToCampaign([0n], {
          account: donor1.account,
          value: parseEther("1"),
        }),
        "CampaignNotActive"
      );
    });
  });

  describe("Direct transfers", function () {
    it("should reject ETH sent directly to the contract", async function () {
      await expectRevert(
        donor1.sendTransaction({
          account: donor1.account,
          to: escrow.address,
          value: parseEther("1"),
        }),
        "Use donateToCampaign(uint256) to donate"
      );
    });
  });

  describe("View functions", function () {
    it("getCampaignCount should return the correct count", async function () {
      expect(await escrow.read.getCampaignCount()).to.equal(0n);

      await escrow.write.createCampaign([beneficiary.account.address, TARGET_AMOUNT, DEADLINE], { account: admin.account });
      expect(await escrow.read.getCampaignCount()).to.equal(1n);

      await escrow.write.createCampaign([beneficiary.account.address, TARGET_AMOUNT, DEADLINE], { account: admin.account });
      expect(await escrow.read.getCampaignCount()).to.equal(2n);
    });

    it("getCampaign should reject a non-existent campaign", async function () {
      await expectRevert(
        escrow.read.getCampaign([999n]),
        "CampaignNotFound"
      );
    });
  });
});
