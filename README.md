# SnarkLab

**Private asset transfers with cryptographic guarantees**

SnarkLab is a privacy-preserving wallet that enables confidential ERC20 token transfers using Trusted Execution Environments (TEE) and Sparse Merkle Trees. Transfer assets off-chain with complete privacy while maintaining verifiable on-chain commitments.

## Overview

SnarkLab separates deposits/withdrawals (on-chain) from transfers (off-chain):

- **Deposit** tokens into the SnarkLab contract on Base Sepolia
- **Transfer** privately off-chain - balances tracked in encrypted TEE environment
- **Withdraw** back to your wallet anytime with on-chain verification

Your balance is never revealed. Transfers happen privately. Only you can prove your holdings.

## Architecture

### Smart Contract (`contracts/`)
- **Void.sol** - Main contract for deposits, withdrawals, and TEE liveness tracking
- **SparseMerkleTreeVerifier.sol** - On-chain proof verification
- Deployed on Base Sepolia with Foundry

### Backend (`rofl-backend/`)
- **TEE-ready Node.js service** - Processes private transfers in isolated environment
- **Sparse Merkle Trees** - Efficient balance commitments using `@cedoor/smt`
- **RocksDB persistence** - Local storage for encrypted state
- **JWT authentication** - Wallet-based access control
- **Signature-derived secrets** - User privacy without centralized keys

Key components:
- `balance.service.ts` - SMT-based balance tracking
- `transaction.service.ts` - Private transfer history
- `secret.service.ts` - Signature-derived encryption keys
- `webhook.service.ts` - Alchemy webhook handler for deposits
- `rofl.service.ts` - TEE withdrawal execution

### Frontend (`frontend/`)
- **Next.js 16** + React 19
- **Wallet integration** - WalletConnect, MetaMask, Coinbase
- **Real-time updates** - Balance & transaction syncing
- **Zero-knowledge proofs** - Noir circuit integration for compliance

## How It Works

### 1. Deposit (On-Chain)
```
User → Approve ERC20 → Void.deposit() → Contract holds tokens
```
Backend detects deposit via Alchemy webhook and updates your private balance.

### 2. Transfer (Off-Chain)
```
Sender signs transfer → Backend verifies → Updates SMT → Both balances updated
```
No on-chain transaction. Instant. Private. Only participants know.

### 3. Withdraw (On-Chain)
```
User requests → Backend verifies balance → TEE calls Void.withdraw() → Tokens sent
```
Your balance is checked against the SMT, then withdrawn on-chain.

### Security Model

**Privacy:**
- Balances stored in SMT with user-specific secrets
- Secrets derived from wallet signatures (never stored centrally)
- Off-chain transfers leave no public trace

**Availability:**
- TEE must ping contract every 2 hours to prove liveness
- If TEE dies, users can emergency withdraw with SMT proofs
- Challenge period allows disputes before withdrawals

**Cryptography:**
- Sparse Merkle Trees for efficient membership proofs
- Keccak256 hashing
- Signature-based key derivation

## Setup

### Prerequisites
- Node.js 18+
- RocksDB
- Foundry (for contracts)

### Backend
```bash
cd rofl-backend
npm install
cp .env.example .env
# Edit .env with your config
npm run dev
```

Required env vars:
- `VOID_CONTRACT_ADDRESS` - Deployed Void contract
- `BASE_SEPOLIA_RPC_URL` - Alchemy/Infura RPC
- `JWT_SECRET` - Session signing key
- `ALCHEMY_SIGNING_KEY` - Webhook verification

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local
npm run dev
```

Required env vars:
- `NEXT_PUBLIC_VOID_CONTRACT_ADDRESS` - Same as backend
- `NEXT_PUBLIC_VOID_API_BASE_URL` - Backend URL (e.g. http://localhost:3001)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` - WalletConnect project ID

### Smart Contracts
```bash
cd contracts
forge install
forge build
forge script script/Void.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
```

## Usage Flow

### 1. Connect Wallet
- Visit frontend, connect MetaMask/WalletConnect
- Sign login message for JWT authentication

### 2. Unlock Account
- Sign two messages to generate your secrets:
  - Balance secret (encrypts your balances)
  - Transaction secret (encrypts your transfer history)
- These never leave your device until hashed

### 3. Deposit Tokens
- Select token (USDC, USDT, etc.)
- Approve contract to spend tokens
- Deposit - tokens locked in contract, balance updated privately

### 4. Send Privately
- Enter recipient address and amount
- Recipient must also be unlocked (have secrets set)
- Sign transfer - both balances updated off-chain instantly

### 5. Withdraw
- Select token and amount
- TEE verifies your balance, executes withdrawal
- Tokens arrive in your wallet on-chain

## Project Structure

```
snarklab/
├── contracts/          # Solidity contracts (Foundry)
│   ├── src/
│   │   ├── Void.sol   # Main deposit/withdraw contract
│   │   └── SparseMerkleTreeVerifier.sol
│   └── script/        # Deployment scripts
├── rofl-backend/      # TEE-ready backend
│   ├── src/
│   │   ├── api/       # Express routes & controllers
│   │   ├── services/  # Core business logic
│   │   │   ├── balance.service.ts      # SMT balance tracking
│   │   │   ├── transaction.service.ts  # Transfer history
│   │   │   ├── secret.service.ts       # User key derivation
│   │   │   └── rofl.service.ts         # TEE operations
│   │   └── types/     # TypeScript definitions
│   └── data/          # RocksDB storage (gitignored)
└── frontend/          # Next.js UI
    ├── src/
    │   ├── app/       # Pages
    │   ├── components/ # React components
    │   │   └── WalletDashboard/ # Main wallet UI
    │   └── lib/       # API clients & utilities
    └── public/        # Static assets
```

## Configuration

### Backend `.env`
```env
PORT=3001
JWT_SECRET=your-secret-key-change-in-production
DB_PATH=./data
IS_TEE=false  # Set true when running in TEE
SKIP_RECEIVER_SECRET_CHECK=false  # Require both parties to unlock
VOID_CONTRACT_ADDRESS=0x...
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/...
ALCHEMY_SIGNING_KEY=...
```

### Frontend `.env.local`
```env
NEXT_PUBLIC_VOID_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_VOID_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
```

## Development

### Testing Locally
1. Start backend: `cd rofl-backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Connect to Base Sepolia testnet
4. Get test tokens from faucets
5. Deposit and transfer

### Database Management
Balances and transactions are stored in RocksDB at `rofl-backend/data/`:
```
secret:balance:{wallet}  → User's balance secret
secret:tx:{wallet}       → User's transaction secret
balance:{wallet}:{token} → Balance value
txdata:{sender}:{receiver}:{token}:{type} → Transaction history
```

To reset: Stop backend, delete `./data` folder, restart.

## Security Considerations

⚠️ **Current limitations:**
- Backend is not yet running in actual TEE (set `IS_TEE=false`)
- Emergency withdrawals not fully implemented
- No compliance proof UI yet (Noir circuits exist but not integrated)

**For production:**
- Deploy backend in Oasis ROFL or similar TEE
- Enable signature verification on withdrawals
- Implement SMT proof verification in emergency withdrawals
- Add rate limiting and DOS protection
- Set strong `JWT_SECRET` and rotate regularly

## Why SnarkLab?

**Problem:** Public blockchains reveal all balances and transfers
**Solution:** Move sensitive operations off-chain into encrypted TEE

- ✅ **Private balances** - No one knows what you hold
- ✅ **Private transfers** - Off-chain, instant, no gas
- ✅ **Verifiable** - SMT proofs ensure integrity
- ✅ **Non-custodial** - You control secrets, withdraw anytime
- ✅ **Compliance-ready** - ZK proofs without revealing data
- ✅ **Zero-knowledge** - Cryptographic guarantees via Noir circuits

## Roadmap

- [ ] Full TEE deployment (Oasis ROFL)
- [ ] ZK compliance proof generation UI
- [ ] Multi-chain support (Ethereum, Arbitrum)
- [ ] Atomic swaps within SnarkLab
- [ ] Social recovery for secrets
- [ ] Mobile app

## Tech Stack

**Smart Contracts:** Solidity, Foundry, OpenZeppelin  
**Backend:** Node.js, Express, TypeScript, RocksDB, Viem  
**Privacy:** Sparse Merkle Trees, Signature-based secrets  
**ZK Proofs:** Noir, Aztec BB.js  
**Frontend:** Next.js 16, React 19, Wagmi, Framer Motion, TailwindCSS  
**TEE:** ROFL-compatible architecture  
**Network:** Base Sepolia (testnet)

