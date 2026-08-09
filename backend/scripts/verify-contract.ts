import { createPublicClient, http, defineChain } from "viem";

const sepolia = defineChain({
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] } },
  testnet: true,
});

const client = createPublicClient({ chain: sepolia, transport: http() });
const code = await client.getBytecode({
  address: "0xfdde78c41829451073532fb772f6e6cc4fb38417",
});
console.log("Contract bytecode length:", code ? code.length : "NOT FOUND");
console.log("Contract is live:", code !== undefined && code !== "0x" ? "YES ✅" : "NO ❌");