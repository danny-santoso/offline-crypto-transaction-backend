# Mobile API Interface Specifications

## Overview

This document defines the API interface specifications for mobile applications to interact with the Offline Crypto Transactions backend. The API is designed to support offline-first mobile applications with robust synchronization capabilities.

## Base Configuration

- **Base URL**: `https://api.offline-crypto.com/v1` (production) / `http://localhost:3000/api` (development)
- **Protocol**: HTTPS (required for production)
- **Content-Type**: `application/json`
- **Authentication**: JWT Bearer tokens
- **Rate Limiting**: 1000 requests per hour per authenticated user

## Authentication & Authorization

### JWT Token Structure
```json
{
  "sub": "user_wallet_address",
  "iat": 1642680000,
  "exp": 1642766400,
  "scope": ["read:balance", "write:transactions", "read:keys"],
  "device_id": "mobile_device_unique_id",
  "session_id": "unique_session_identifier"
}
```

### Authentication Endpoints

#### POST /auth/login
**Purpose**: Authenticate user with wallet signature
```json
{
  "wallet_address": "0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4",
  "signature": "0x...",
  "message": "Login to Offline Crypto App at 2024-01-20T10:30:00Z",
  "device_info": {
    "device_id": "unique_device_identifier",
    "platform": "ios|android",
    "app_version": "1.0.0",
    "os_version": "iOS 15.0"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 86400,
    "user": {
      "wallet_address": "0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4",
      "balance": "1.5",
      "offline_credits": "0.5"
    }
  }
}
```

#### POST /auth/refresh
**Purpose**: Refresh expired access token
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### POST /auth/logout
**Purpose**: Invalidate current session
```json
{
  "device_id": "unique_device_identifier"
}
```

## Core API Endpoints

### User Balance & Account

#### GET /mobile/balance
**Purpose**: Get user's current balance and offline credits
**Authentication**: Required
**Response**:
```json
{
  "success": true,
  "data": {
    "wallet_address": "0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4",
    "balance": "1.5",
    "offline_credits": "0.5",
    "pending_transactions": 2,
    "last_sync": "2024-01-20T10:30:00Z"
  }
}
```

#### GET /mobile/account/info
**Purpose**: Get comprehensive account information
**Authentication**: Required
**Response**:
```json
{
  "success": true,
  "data": {
    "wallet_address": "0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4",
    "balance": "1.5",
    "offline_credits": "0.5",
    "total_transactions": 25,
    "account_created": "2024-01-01T00:00:00Z",
    "last_activity": "2024-01-20T10:30:00Z",
    "verification_status": "verified",
    "limits": {
      "daily_purchase_limit": "10.0",
      "daily_redemption_limit": "5.0",
      "offline_token_limit": "2.0"
    }
  }
}
```

### Token Operations

#### POST /mobile/tokens/purchase
**Purpose**: Purchase offline tokens
**Authentication**: Required
```json
{
  "amount": "1.0",
  "payment_method": "wallet_balance",
  "device_location": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "accuracy": 10
  },
  "offline_mode": false
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "transaction_id": "tx_123456789",
    "amount": "1.0",
    "fee": "0.01",
    "total": "1.01",
    "status": "confirmed",
    "offline_tokens": [
      {
        "token_id": "ot_abc123",
        "amount": "0.5",
        "expires_at": "2024-01-27T10:30:00Z",
        "signature": "0x...",
        "qr_code": "data:image/png;base64,..."
      }
    ]
  }
}
```

#### POST /mobile/tokens/redeem
**Purpose**: Redeem offline tokens for cryptocurrency
**Authentication**: Required
```json
{
  "tokens": [
    {
      "token_id": "ot_abc123",
      "signature": "0x...",
      "amount": "0.5"
    }
  ],
  "destination_address": "0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4"
}
```

#### POST /mobile/tokens/validate
**Purpose**: Validate offline token signature
**Authentication**: Required
```json
{
  "token_id": "ot_abc123",
  "signature": "0x...",
  "amount": "0.5",
  "issuer": "0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4",
  "nonce": 12345
}
```

### Transaction Management

#### GET /mobile/transactions
**Purpose**: Get user's transaction history with pagination
**Authentication**: Required
**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `type`: Filter by transaction type (purchase|redeem|transfer)
- `status`: Filter by status (pending|confirmed|failed)
- `from_date`: Start date (ISO 8601)
- `to_date`: End date (ISO 8601)

**Response**:
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "tx_123456789",
        "type": "purchase",
        "amount": "1.0",
        "fee": "0.01",
        "status": "confirmed",
        "created_at": "2024-01-20T10:30:00Z",
        "confirmed_at": "2024-01-20T10:31:00Z",
        "block_number": 12345678,
        "transaction_hash": "0x..."
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 5,
      "total_items": 100,
      "items_per_page": 20
    }
  }
}
```

#### GET /mobile/transactions/:id
**Purpose**: Get detailed transaction information
**Authentication**: Required
**Response**:
```json
{
  "success": true,
  "data": {
    "id": "tx_123456789",
    "type": "purchase",
    "amount": "1.0",
    "fee": "0.01",
    "status": "confirmed",
    "created_at": "2024-01-20T10:30:00Z",
    "confirmed_at": "2024-01-20T10:31:00Z",
    "block_number": 12345678,
    "transaction_hash": "0x...",
    "gas_used": 21000,
    "gas_price": "20000000000",
    "confirmations": 12,
    "offline_tokens": [
      {
        "token_id": "ot_abc123",
        "amount": "0.5",
        "status": "active",
        "expires_at": "2024-01-27T10:30:00Z"
      }
    ]
  }
}
```

### Offline Token Management

#### GET /mobile/offline-tokens
**Purpose**: Get user's offline tokens
**Authentication**: Required
**Query Parameters**:
- `status`: Filter by status (active|expired|used)
- `include_expired`: Include expired tokens (default: false)

**Response**:
```json
{
  "success": true,
  "data": {
    "tokens": [
      {
        "token_id": "ot_abc123",
        "amount": "0.5",
        "status": "active",
        "created_at": "2024-01-20T10:30:00Z",
        "expires_at": "2024-01-27T10:30:00Z",
        "signature": "0x...",
        "qr_code": "data:image/png;base64,...",
        "issuer": "0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4",
        "nonce": 12345
      }
    ],
    "summary": {
      "total_tokens": 5,
      "active_tokens": 3,
      "expired_tokens": 2,
      "total_value": "2.5"
    }
  }
}
```

#### POST /mobile/offline-tokens/split
**Purpose**: Split an offline token into smaller denominations
**Authentication**: Required
```json
{
  "token_id": "ot_abc123",
  "split_amounts": ["0.2", "0.3"],
  "signature": "0x..."
}
```

#### POST /mobile/offline-tokens/refresh
**Purpose**: Refresh expiring offline tokens
**Authentication**: Required
```json
{
  "token_ids": ["ot_abc123", "ot_def456"]
}
```

### Public Key Management

#### GET /mobile/public-keys
**Purpose**: Get authorized OTM public keys for offline validation
**Authentication**: Required
**Response**:
```json
{
  "success": true,
  "data": {
    "public_keys": [
      {
        "address": "0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4",
        "public_key": "0x04...",
        "status": "active",
        "added_at": "2024-01-01T00:00:00Z",
        "expires_at": "2024-12-31T23:59:59Z"
      }
    ],
    "last_updated": "2024-01-20T10:30:00Z",
    "cache_duration": 3600
  }
}
```

## Offline-First Data Synchronization

### Sync Endpoints

#### POST /mobile/sync/upload
**Purpose**: Upload offline transactions for processing
**Authentication**: Required
```json
{
  "device_id": "unique_device_identifier",
  "last_sync": "2024-01-20T09:30:00Z",
  "offline_transactions": [
    {
      "local_id": "local_tx_123",
      "type": "token_validation",
      "data": {
        "token_id": "ot_abc123",
        "signature": "0x...",
        "timestamp": "2024-01-20T10:00:00Z",
        "location": {
          "latitude": 37.7749,
          "longitude": -122.4194
        }
      }
    }
  ]
}
```

#### GET /mobile/sync/download
**Purpose**: Download updates since last sync
**Authentication**: Required
**Query Parameters**:
- `since`: Last sync timestamp (ISO 8601)
- `device_id`: Device identifier

**Response**:
```json
{
  "success": true,
  "data": {
    "sync_timestamp": "2024-01-20T10:30:00Z",
    "updates": {
      "balance_changes": [
        {
          "type": "credit",
          "amount": "0.5",
          "timestamp": "2024-01-20T10:15:00Z",
          "transaction_id": "tx_987654321"
        }
      ],
      "new_transactions": [
        {
          "id": "tx_987654321",
          "type": "purchase",
          "amount": "0.5",
          "status": "confirmed",
          "created_at": "2024-01-20T10:15:00Z"
        }
      ],
      "token_updates": [
        {
          "token_id": "ot_abc123",
          "status": "used",
          "used_at": "2024-01-20T10:20:00Z"
        }
      ],
      "public_key_updates": []
    }
  }
}
```

### Conflict Resolution

#### POST /mobile/sync/resolve-conflicts
**Purpose**: Resolve synchronization conflicts
**Authentication**: Required
```json
{
  "conflicts": [
    {
      "type": "balance_mismatch",
      "local_value": "1.5",
      "server_value": "1.3",
      "resolution": "use_server",
      "timestamp": "2024-01-20T10:30:00Z"
    }
  ]
}
```

## Error Handling

### Standard Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient balance for this transaction",
    "details": {
      "required": "1.0",
      "available": "0.5"
    },
    "timestamp": "2024-01-20T10:30:00Z",
    "request_id": "req_123456789"
  }
}
```

### Common Error Codes
- `INVALID_TOKEN`: Invalid authentication token
- `INSUFFICIENT_BALANCE`: Insufficient account balance
- `TOKEN_EXPIRED`: Offline token has expired
- `INVALID_SIGNATURE`: Invalid cryptographic signature
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `NETWORK_ERROR`: Blockchain network error
- `SYNC_CONFLICT`: Data synchronization conflict
- `DEVICE_NOT_AUTHORIZED`: Device not authorized for this account

## Security Considerations

### Request Signing
All sensitive operations require request signing:
```json
{
  "data": {
    "amount": "1.0",
    "timestamp": "2024-01-20T10:30:00Z"
  },
  "signature": "0x...",
  "nonce": 12345
}
```

### Rate Limiting
- **Authentication**: 10 requests per minute
- **Balance queries**: 100 requests per hour
- **Token operations**: 50 requests per hour
- **Sync operations**: 20 requests per minute

### Data Encryption
- All sensitive data encrypted with AES-256
- Keys derived from user's wallet private key
- Offline tokens encrypted for local storage

## Mobile SDK Interface

### Initialization
```typescript
import { OfflineCryptoSDK } from '@offline-crypto/mobile-sdk';

const sdk = new OfflineCryptoSDK({
  baseUrl: 'https://api.offline-crypto.com/v1',
  walletAddress: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4',
  privateKey: 'user_private_key',
  deviceId: 'unique_device_identifier'
});
```

### Authentication
```typescript
const authResult = await sdk.auth.login({
  signature: await sdk.wallet.signMessage('login_message'),
  deviceInfo: sdk.device.getInfo()
});
```

### Token Operations
```typescript
// Purchase tokens
const purchaseResult = await sdk.tokens.purchase({
  amount: '1.0',
  paymentMethod: 'wallet_balance'
});

// Validate offline token
const isValid = await sdk.tokens.validate({
  tokenId: 'ot_abc123',
  signature: '0x...',
  amount: '0.5'
});
```

### Offline Synchronization
```typescript
// Enable offline mode
await sdk.sync.enableOfflineMode();

// Sync when back online
const syncResult = await sdk.sync.synchronize();
```

## Testing & Development

### Mock API Server
A mock API server is available for development and testing:
```bash
npm run start:mock-api
```

### Test Credentials
- **Test Wallet**: `0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4`
- **Test Private Key**: `0x...` (provided in development environment)
- **Test Tokens**: Pre-generated test tokens available

### API Documentation
Interactive API documentation available at:
- Development: `http://localhost:3000/docs`
- Production: `https://api.offline-crypto.com/docs`