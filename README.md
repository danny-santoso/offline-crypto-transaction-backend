# Offline Crypto Transactions Backend

Backend API and blockchain infrastructure for the offline cryptocurrency transactions system.

## Project Structure

```
offline-crypto-backend/
├── src/                          # TypeScript source code
│   ├── services/                 # Business logic services
│   │   ├── web3Service.ts       # Ethereum blockchain integration
│   │   ├── contractService.ts   # Smart contract interaction
│   │   └── __tests__/           # Service unit tests
│   ├── __tests__/               # Integration tests
│   └── index.ts                 # Express app entry point
├── blockchain/                   # Hardhat blockchain development
│   ├── contracts/               # Solidity smart contracts
│   ├── test/                    # Contract tests
│   ├── ignition/                # Deployment scripts
│   └── hardhat.config.ts        # Hardhat configuration
├── dist/                        # Compiled JavaScript (generated)
├── node_modules/                # Dependencies
├── .env                         # Environment variables
├── .env.example                 # Environment template
├── package.json                 # Node.js dependencies
├── tsconfig.json               # TypeScript configuration
├── jest.config.js              # Jest testing configuration
└── .eslintrc.js                # ESLint configuration
```

## Features

- **Express.js API**: RESTful API for mobile app integration
- **Web3.js Integration**: Ethereum blockchain connectivity
- **Hardhat Development**: Smart contract development and testing
- **TypeScript**: Type-safe development
- **Jest Testing**: Comprehensive test suite
- **ESLint**: Code quality and consistency
- **Environment Configuration**: Testnet and mainnet support

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Git

## Installation

1. **Clone and navigate to the project:**
   ```bash
   cd offline-crypto-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

## Development

### Start the API server
```bash
npm run dev
```

### Build the project
```bash
npm run build
```

### Run tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Lint code
```bash
npm run lint
```

### Fix linting issues
```bash
npm run lint:fix
```

## Blockchain Development

### Start local Hardhat network
```bash
cd blockchain
npx hardhat node
```

### Compile smart contracts
```bash
cd blockchain
npx hardhat compile
```

### Run contract tests
```bash
cd blockchain
npx hardhat test
```

### Deploy to local network
```bash
cd blockchain
npx hardhat ignition deploy ignition/modules/Deploy.ts --network localhost
```

### Deploy to testnet (Sepolia)
```bash
cd blockchain
npx hardhat ignition deploy ignition/modules/Deploy.ts --network sepolia
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `ETHEREUM_NETWORK` | Target network | `localhost` |
| `LOCAL_RPC_URL` | Local blockchain URL | `http://127.0.0.1:8545` |
| `SEPOLIA_RPC_URL` | Sepolia testnet RPC | - |
| `GOERLI_RPC_URL` | Goerli testnet RPC | - |
| `PRIVATE_KEY` | Deployment private key | - |
| `ETHERSCAN_API_KEY` | Contract verification | - |

## API Endpoints

### Health Check
- `GET /health` - Server health status
- `GET /api` - API information

### Blockchain Integration (Coming Soon)
- `GET /api/balance/:address` - Get user balance
- `POST /api/purchase-tokens` - Purchase offline tokens
- `POST /api/redeem-tokens` - Redeem offline tokens
- `GET /api/public-keys` - Get public key database
- `POST /api/validate-signature` - Validate token signature

## Testing

The project includes comprehensive testing:

- **Unit Tests**: Individual service testing
- **Integration Tests**: Full system testing
- **Contract Tests**: Smart contract testing

Run all tests:
```bash
npm test
```

## Security

- Environment variables for sensitive data
- Rate limiting on API endpoints
- Helmet.js for security headers
- Input validation and sanitization
- Secure key management practices

## Contributing

1. Follow TypeScript and ESLint conventions
2. Write tests for new features
3. Update documentation
4. Use conventional commit messages

## License

MIT License - see LICENSE file for details