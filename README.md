# DonateChain — Blockchain Donation Platform

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
│
└── document/               # FYP documentation & references
```

## Networks

- **Sepolia Testnet** (current deployment)
  - Contract: `0xfdde78c41829451073532fb772f6e6cc4fb38417`
  - Chain ID: `11155111`
  - RPC: `https://ethereum-sepolia-rpc.publicnode.com`

- **Local Hardhat** (development)
  - Chain ID: `31337`
  - RPC: `http://127.0.0.1:8545`

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

# Push schema to database
npm run db:push

# Generate Prisma client
npm run db:generate

# Seed admin user
npm run db:seed
```

### 5. Run the Application

```bash
# Terminal 1: Next.js dev server (from frontend/)
npm run dev

# Terminal 2: Event indexer (from frontend/)
npm run indexer
```

> **Note:** No need to run Hardhat node when using Sepolia deployment. The app connects directly to the public Sepolia RPC.

### Local Development with Hardhat

If developing locally:

```bash
# Terminal 1: Start local blockchain
cd backend
npx hardhat node

# Terminal 2: Deploy contract
npx hardhat ignition deploy ignition/modules/DonationEscrow.ts --network localhost --reset

# Update frontend/.env with local contract address and chain details

# Terminal 3: Reset local DB
cd frontend
npm run db:reset:local

# Terminal 4: Run app
npm run dev:all
```

### 6. Access the App

- **App**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000/admin
  - Connect with the admin wallet in MetaMask

## Environment Variables

Configure `frontend/.env`:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Deployed DonationEscrow contract address |
| `NEXT_PUBLIC_CHAIN_ID` | Chain ID (11155111 for Sepolia, 31337 for Hardhat) |
| `NEXT_PUBLIC_RPC_URL` | RPC URL |
| `NEXT_PUBLIC_NETWORK_NAME` | Network name (Sepolia / Localhost) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Reown Cloud project ID |
| `NEXT_PUBLIC_ADMIN_WALLET_ADDRESS` | Admin wallet address |

## Authentication

All users authenticate by connecting their crypto wallet via Reown AppKit. No username/password.

- **Admin**: Connect a wallet whose address is linked to a user with `role: 'admin'` in the database → access `/admin` pages
- **User**: Connect any wallet → browse campaigns, donate, receive funds
- The seed script (`npm run db:seed`) creates the admin user

## Key Features

- **Create Campaigns**: Beneficiaries create donation campaigns with goals and deadlines
- **Donate**: Donors contribute ETH directly to campaigns via smart contract escrow
- **Withdraw**: Beneficiaries withdraw funds only after campaign deadline passes
- **Transparent**: All transactions recorded on-chain, indexed for easy tracking
- **Wallet-based Auth**: No passwords, connect wallet to participate

## Scripts

```bash
# Frontend
npm run dev              # Start dev server
npm run build            # Production build
npm run db:push          # Push schema to database
npm run db:generate       # Generate Prisma client
npm run db:seed          # Seed database
npm run db:studio        # Open Prisma Studio
npm run indexer          # Run event indexer
npm run indexer:reindex  # Reindex all campaigns

# Backend
cd ../backend
npm run compile          # Compile smart contracts
npm run test             # Run contract tests
npm run node             # Start local Hardhat node
npm run deploy           # Deploy contract and sync env
```
