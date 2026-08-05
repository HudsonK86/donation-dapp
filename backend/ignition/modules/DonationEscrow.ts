import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DonationEscrowModule = buildModule("DonationEscrowModule", (m) => {
  const donationEscrow = m.contract("DonationEscrow");

  return { donationEscrow };
});

export default DonationEscrowModule;
