import request from 'supertest';
import { ethers } from 'ethers';
import app from '../../index';
import { deploymentConfigService } from '../../services/deploymentConfig';
import { monitoringService } from '../../services/monitoring';

describe('Token Lifecycle Integration Tests', () => {
  let contractAddress: string;
  let provider: ethers.JsonRpcProvider;
  let signer: ethers.Wallet;
  let contract: ethers.Contract;

  beforeAll(async () => {
    // Clear monitoring events
    monitoringService.clearEvents();

    // Get deployment info
    const deploymentInfo = deploymentConfigService.loadDeploymentInfo('localhost');
    if (!deploymentInfo) {
      throw new Error('No localhost deployment found. Please deploy the contract first.');
    }

    contractAddress = deploymentInfo.contractAddress;

    // Set up ethers connection
    provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // Use the first account from Hardhat's default accounts
    signer = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);

    // Get contract ABI (simplified for testing)
    const contractABI = [
      'function purchaseOfflineTokens(uint256 amount) external payable',
      'function redeemOfflineTokens(uint256 amount) external',
      'function getOfflineTokenCredits(address user) external view returns (uint256)',
      'function getContractBalance() external view returns (uint256)',
      'function validateTokenSignature(bytes signature, uint256 amount, bytes32 tokenId, address issuer, uint256 nonce) external returns (bool)',
      'function getAuthorizedOTMs() external view returns (address[])',
      'function isAuthorizedOTM(address otmAddress) external view returns (bool)'
    ];

    contract = new ethers.Contract(contractAddress, contractABI, signer);
  });

  describe('Complete Token Lifecycle', () => {
    const testAmount = ethers.parseEther('1.0'); // 1 ETH worth of tokens

    test('should complete full token purchase and redemption cycle', async () => {
      // Step 1: Check initial balance
      const initialBalance = await contract.getOfflineTokenCredits(signer.address);
      expect(initialBalance).toBe(0n);

      // Step 2: Purchase offline tokens via smart contract
      const purchaseTx = await contract.purchaseOfflineTokens(testAmount, {
        value: testAmount
      });
      await purchaseTx.wait();

      // Step 3: Verify tokens were purchased
      const balanceAfterPurchase = await contract.getOfflineTokenCredits(signer.address);
      expect(balanceAfterPurchase).toBe(testAmount);

      // Step 4: Check contract balance
      const contractBalance = await contract.getContractBalance();
      expect(contractBalance).toBeGreaterThanOrEqual(testAmount);

      // Step 5: Test API balance endpoint
      const balanceResponse = await request(app)
        .get(`/api/balance/${signer.address}`)
        .expect(200);

      expect(balanceResponse.body.success).toBe(true);
      expect(balanceResponse.body.data.balance).toBe('0'); // API balance is different from offline credits

      // Step 6: Redeem tokens back to cryptocurrency
      const redeemTx = await contract.redeemOfflineTokens(testAmount);
      await redeemTx.wait();

      // Step 7: Verify tokens were redeemed
      const balanceAfterRedemption = await contract.getOfflineTokenCredits(signer.address);
      expect(balanceAfterRedemption).toBe(0n);
    });

    test('should handle token purchase via API', async () => {
      const purchaseData = {
        userAddress: signer.address,
        amount: ethers.formatEther(testAmount),
        privateKey: signer.privateKey
      };

      const response = await request(app)
        .post('/api/purchase-tokens')
        .send(purchaseData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transactionHash');
      expect(response.body.data).toHaveProperty('amount');
    });

    test('should handle token redemption via API', async () => {
      // First purchase some tokens
      await contract.purchaseOfflineTokens(testAmount, {
        value: testAmount
      });

      const redeemData = {
        userAddress: signer.address,
        amount: ethers.formatEther(testAmount),
        privateKey: signer.privateKey
      };

      const response = await request(app)
        .post('/api/redeem-tokens')
        .send(redeemData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('transactionHash');
      expect(response.body.data).toHaveProperty('amount');
    });
  });

  describe('OTM Integration Tests', () => {
    test('should verify OTM authorization', async () => {
      const authorizedOTMs = await contract.getAuthorizedOTMs();
      expect(authorizedOTMs.length).toBeGreaterThan(0);

      // Check if first OTM is authorized
      const isAuthorized = await contract.isAuthorizedOTM(authorizedOTMs[0]);
      expect(isAuthorized).toBe(true);
    });

    test('should get public keys via API', async () => {
      const response = await request(app)
        .get('/api/public-keys')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('publicKeys');
      expect(Array.isArray(response.body.data.publicKeys)).toBe(true);
    });

    test('should validate token signature via API', async () => {
      // Create a mock signature for testing
      const tokenData = {
        amount: ethers.formatEther(testAmount),
        tokenId: ethers.keccak256(ethers.toUtf8Bytes('test-token-123')),
        issuer: signer.address,
        nonce: 1
      };

      // Create a simple signature (this would normally be done by OTM)
      const messageHash = ethers.solidityPackedKeccak256(
        ['uint256', 'bytes32', 'address', 'uint256'],
        [testAmount, tokenData.tokenId, tokenData.issuer, tokenData.nonce]
      );
      
      const signature = await signer.signMessage(ethers.getBytes(messageHash));

      const response = await request(app)
        .post('/api/validate-signature')
        .send({
          signature,
          amount: tokenData.amount,
          tokenId: tokenData.tokenId,
          issuer: tokenData.issuer,
          nonce: tokenData.nonce
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('isValid');
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle insufficient balance gracefully', async () => {
      const largeAmount = ethers.parseEther('1000000'); // Very large amount

      try {
        await contract.redeemOfflineTokens(largeAmount);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Insufficient offline token credits');
      }
    });

    test('should handle invalid addresses in API', async () => {
      const response = await request(app)
        .get('/api/balance/invalid-address')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid address');
    });

    test('should handle missing required fields in API', async () => {
      const response = await request(app)
        .post('/api/purchase-tokens')
        .send({
          // Missing required fields
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Performance Tests', () => {
    test('should handle multiple concurrent requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/public-keys')
          .expect(200)
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.body.success).toBe(true);
      });
    });

    test('should complete token operations within reasonable time', async () => {
      const startTime = Date.now();

      // Purchase tokens
      const purchaseTx = await contract.purchaseOfflineTokens(testAmount, {
        value: testAmount
      });
      await purchaseTx.wait();

      // Redeem tokens
      const redeemTx = await contract.redeemOfflineTokens(testAmount);
      await redeemTx.wait();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within 30 seconds
      expect(duration).toBeLessThan(30000);

      // Record performance metrics
      monitoringService.recordPerformance('token-lifecycle', duration, true);
    });
  });

  afterAll(async () => {
    // Clean up any remaining state
    try {
      const balance = await contract.getOfflineTokenCredits(signer.address);
      if (balance > 0n) {
        const redeemTx = await contract.redeemOfflineTokens(balance);
        await redeemTx.wait();
      }
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  });
});