import { defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";

export default defineConfig({
  plugins: [hardhatToolboxViem, hardhatNodeTestRunner],
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
});
