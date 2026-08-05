# 🔗 DonateChain — Blockchain Donation Platform

A full-stack decentralized application (dApp) for transparent and traceable charitable donations, powered by smart contract escrow on Ethereum.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, TailwindCSS 4 |
| Blockchain | Reown AppKit, Wagmi, Viem, Solidity, Hardhat |
| Database | PostgreSQL, Prisma ORM |
| Auth | Wallet-based for all users (Reown AppKit) — admins identified by wallet address |

## Project Structure

```
donation-dapp/
├── backend/                # Smart contracts (Hardhat + Solidity)
│   ├── contracts/          # Solidity contracts
│   ├── ignition/modules/   # Hardhat Ignition deployment
│   └── test/               # Contract tests
│
├── frontend/               # Next.js web application
│   ├── src/app/            # Pages & API routes
│   ├── src/components/     # Reusable UI components
│   ├── src/context/        # Web3 provider
│   ├── src/hooks/          # Custom React hooks (useContract, useAdminAuth)
│   ├── src/lib/            # Prisma client
│   ├── src/utils/          # Config, contract ABI
│   ├── scripts/            # Event indexer
│   └── prisma/             # Database schema & seed
```

## Quick Start

### 1. Prerequisites
- Node.js 18+
- PostgreSQL running locally
- MetaMask browser extension

### 2. Backend Setup (Smart Contracts)

```bash
cd backend
npm install
npx hardhat compile
npx hardhat node                    # Start local blockchain (keep running)
# In a new terminal:
npx hardhat ignition deploy ignition/modules/DonationEscrow.ts --network localhost
```

### 3. Frontend Setup

```bash
cd frontend
npm install
```

### 4. Database Setup

```bash
# Create the database
createdb donation_dapp

# Configure .env.local with your DATABASE_URL and contract address

# Push schema to database
npm run db:push

# Generate Prisma client
npm run db:generate

# Seed admin user (Hardhat Account #0)
npm run db:seed
```

### 5. Run the Application

```bash
# Terminal 1: Hardhat node (from backend/)
npx hardhat node

# Terminal 2: Next.js dev server (from frontend/)
npm run dev

# Terminal 3: Event indexer (from frontend/)
npm run indexer
```

### 6. Access the App

- **App**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000/admin
  - Connect with Hardhat Account #0 in MetaMask
  - Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
  - Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

## Environment Variables

Copy `.env.local` in the frontend folder and fill in:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Deployed DonationEscrow contract address |
| `NEXT_PUBLIC_CHAIN_ID` | Chain ID (31337 for Hardhat) |
| `NEXT_PUBLIC_RPC_URL` | RPC URL (http://127.0.0.1:8545 for Hardhat) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Reown Cloud project ID |
| `NEXT_PUBLIC_ADMIN_WALLET_ADDRESS` | Admin wallet for bootstrapping (optional) |

## Authentication

All users authenticate by connecting their crypto wallet via Reown AppKit. No username/password.

- **Admin**: Connect a wallet whose address is linked to a user with `role: 'admin'` in the database → access `/admin` pages
- **User**: Connect any wallet → browse campaigns, donate, receive funds
- The seed script (`npm run db:seed`) sets Hardhat Account #0 as the default admin
