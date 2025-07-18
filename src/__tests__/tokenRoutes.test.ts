import request from 'supertest';
import app from '../index';
import { Web3Service } from '../services/web3Service';

// Mock the Web3Service to avoid actual blockchain connections during tests
jest.mock('../services/web3Service');

describe('Token Routes', () => {
  let mockWeb3Service: jest.Mocked<Web3Service>;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Create mock instance
    mockWeb3Service = new Web3Service() as jest.Mocked<Web3Service>;
    
    // Setup default mock implementations
    mockWeb3Service.isConnected = jest.fn().mockResolvedValue(true);
    mockWeb3Service.getBalance = jest.fn().mockResolvedValue(BigInt('1000000000000000000')); // 1 ETH
    mockWeb3Service.weiToEther = jest.fn().mockReturnValue('1.0');
    mockWeb3Service.etherToWei = jest.fn().mockReturnValue(BigInt('1000000000000000000'));
    mockWeb3Service.getNetworkId = jest.fn().mockResolvedValue(BigInt(1337));
    mockWeb3Service.getCurrentBlock = jest.fn().mockResolvedValue(BigInt(12345));
    mockWeb3Service.getWeb3 = jest.fn().mockReturnValue({
      utils: {
        isAddress: jest.fn().mockReturnValue(true),
        keccak256: jest.fn().mockReturnValue('0x1234567890abcdef'),
        toWei: jest.fn().mockReturnValue('1000000000000000000'),
        fromWei: jest.fn().mockReturnValue('1.0')
      }
    });
  });

  describe('GET /api/balance/:address', () => {
    const validAddress = '0x742d35Cc6634C0532925a3b8D4C9db96590c6C8b';

    it('should return balance for valid address', async () => {
      const response = await request(app)
        .get(`/api/balance/${validAddress}`)
        .expect(200);

      expect(response.body).toHaveProperty('address', validAddress);
      expect(response.body).toHaveProperty('balance');
      expect(response.body.balance).toHaveProperty('wei');
      expect(response.body.balance).toHaveProperty('ether');
      expect(response.body).toHaveProperty('network');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 400 for invalid address format', async () => {
      const invalidAddress = 'invalid-address';
      
      const response = await request(app)
        .get(`/api/balance/${invalidAddress}`)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid address format');
    });

    it('should return 503 when blockchain is not connected', async () => {
      // Mock blockchain connection failure
      mockWeb3Service.isConnected = jest.fn().mockResolvedValue(false);

      const response = await request(app)
        .get(`/api/balance/${validAddress}`)
        .expect(503);

      expect(response.body).toHaveProperty('error', 'Service Unavailable');
    });

    it('should handle blockchain errors gracefully', async () => {
      // Mock blockchain error
      mockWeb3Service.getBalance = jest.fn().mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .get(`/api/balance/${validAddress}`)
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal Server Error');
    });
  });

  describe('POST /api/purchase-tokens', () => {
    const validAddress = '0x742d35Cc6634C0532925a3b8D4C9db96590c6C8b';
    const validPurchaseData = {
      amount: '0.5',
      userAddress: validAddress,
      expiryHours: 24
    };

    it('should purchase tokens successfully', async () => {
      const response = await request(app)
        .post('/api/purchase-tokens')
        .send(validPurchaseData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
      expect(response.body.token).toHaveProperty('tokenId');
      expect(response.body.token).toHaveProperty('amount');
      expect(response.body.token).toHaveProperty('signature');
      expect(response.body.token).toHaveProperty('issuer');
      expect(response.body).toHaveProperty('userAddress', validAddress);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/purchase-tokens')
        .send({ amount: '0.5' }) // Missing userAddress
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Missing required fields');
    });

    it('should return 400 for invalid address format', async () => {
      const response = await request(app)
        .post('/api/purchase-tokens')
        .send({
          amount: '0.5',
          userAddress: 'invalid-address'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid address format');
    });

    it('should return 400 for invalid amount', async () => {
      const response = await request(app)
        .post('/api/purchase-tokens')
        .send({
          amount: '0',
          userAddress: validAddress
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid amount');
    });

    it('should return 400 for invalid expiry hours', async () => {
      const response = await request(app)
        .post('/api/purchase-tokens')
        .send({
          amount: '0.5',
          userAddress: validAddress,
          expiryHours: -1
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid expiry hours');
    });

    it('should return 400 for insufficient balance', async () => {
      // Mock insufficient balance
      mockWeb3Service.getBalance = jest.fn().mockResolvedValue(BigInt('100000000000000000')); // 0.1 ETH
      mockWeb3Service.etherToWei = jest.fn().mockReturnValue(BigInt('500000000000000000')); // 0.5 ETH requested

      const response = await request(app)
        .post('/api/purchase-tokens')
        .send(validPurchaseData)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Insufficient balance');
    });

    it('should return 503 when blockchain is not connected', async () => {
      mockWeb3Service.isConnected = jest.fn().mockResolvedValue(false);

      const response = await request(app)
        .post('/api/purchase-tokens')
        .send(validPurchaseData)
        .expect(503);

      expect(response.body).toHaveProperty('error', 'Service Unavailable');
    });
  });

  describe('POST /api/redeem-tokens', () => {
    const validAddress = '0x742d35Cc6634C0532925a3b8D4C9db96590c6C8b';
    const validToken = {
      tokenId: 'test-token-id',
      amount: '1000000000000000000', // 1 ETH in wei
      issuer: '0x123456789abcdef',
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 86400, // 24 hours from now
      signature: '0xabcdef123456789',
      nonce: 1
    };

    const validRedemptionData = {
      tokens: [validToken],
      userAddress: validAddress
    };

    it('should redeem tokens successfully', async () => {
      const response = await request(app)
        .post('/api/redeem-tokens')
        .send(validRedemptionData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('redemption');
      expect(response.body.redemption).toHaveProperty('userAddress', validAddress);
      expect(response.body.redemption).toHaveProperty('totalAmount');
      expect(response.body.redemption).toHaveProperty('transactionHash');
      expect(response.body).toHaveProperty('validTokens');
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/redeem-tokens')
        .send({ userAddress: validAddress }) // Missing tokens
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Missing required fields');
    });

    it('should return 400 for empty tokens array', async () => {
      const response = await request(app)
        .post('/api/redeem-tokens')
        .send({
          tokens: [],
          userAddress: validAddress
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Missing required fields');
    });

    it('should return 400 for invalid address format', async () => {
      const response = await request(app)
        .post('/api/redeem-tokens')
        .send({
          tokens: [validToken],
          userAddress: 'invalid-address'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid address format');
    });

    it('should return 503 when blockchain is not connected', async () => {
      mockWeb3Service.isConnected = jest.fn().mockResolvedValue(false);

      const response = await request(app)
        .post('/api/redeem-tokens')
        .send(validRedemptionData)
        .expect(503);

      expect(response.body).toHaveProperty('error', 'Service Unavailable');
    });

    it('should handle mix of valid and invalid tokens', async () => {
      const expiredToken = {
        ...validToken,
        tokenId: 'expired-token',
        expiresAt: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      };

      const response = await request(app)
        .post('/api/redeem-tokens')
        .send({
          tokens: [validToken, expiredToken],
          userAddress: validAddress
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('validTokens');
      expect(response.body).toHaveProperty('invalidTokens');
      expect(response.body.redemption.validTokensCount).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Force an error by mocking a service method to throw
      mockWeb3Service.isConnected = jest.fn().mockRejectedValue(new Error('Unexpected error'));

      const response = await request(app)
        .get('/api/balance/0x742d35Cc6634C0532925a3b8D4C9db96590c6C8b')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal Server Error');
    });
  });
});