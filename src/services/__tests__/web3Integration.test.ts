import { Web3Service } from '../web3Service';
import { ContractService } from '../contractService';

/**
 * Integration tests for Web3Service and ContractService
 * These tests require a running blockchain (local or testnet)
 * Requirements: 7.2, 7.3, 9.2, 9.5
 */
describe('Web3 Integration Tests', () => {
  let web3Service: Web3Service;
  let contractService: ContractService;
  
  // Test configuration
  const testConfig = {
    // Use environment variables or defaults for testing
    rpcUrl: process.env.TEST_RPC_URL || 'http://127.0.0.1:8545',
    contractAddress: process.env.TEST_CONTRACT_ADDRESS,
    testAccount: process.env.TEST_ACCOUNT_ADDRESS,
    privateKey: process.env.TEST_PRIVATE_KEY,
    skipIntegrationTests: process.env.SKIP_INTEGRATION_TESTS === 'true'
  };

  // Mock contract ABI (simplified for testing)
  const mockContractAbi = [
    {
      "inputs": [{"name": "amount", "type": "uint256"}],
      "name": "purchaseOfflineTokens",
      "outputs": [],
      "stateMutability": "payable",
      "type": "function"
    },
    {
      "inputs": [{"name": "amount", "type": "uint256"}],
      "name": "redeemOfflineTokens",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{"name": "user", "type": "address"}],
      "name": "getBalance",
      "outputs": [{"name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{"name": "user", "type": "address"}],
      "name": "getOfflineTokenCredits",
      "outputs": [{"name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getTotalSupply",
      "outputs": [{"name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    }
  ];

  beforeAll(() => {
    if (testConfig.skipIntegrationTests) {
      console.log('Skipping integration tests (SKIP_INTEGRATION_TESTS=true)');
      return;
    }

    web3Service = new Web3Service();
    contractService = new ContractService(web3Service);

    // Initialize contract if address is provided
    if (testConfig.contractAddress) {
      contractService.initializeContract(mockContractAbi, testConfig.contractAddress);
    }
  });

  describe('Web3Service Integration', () => {
    beforeEach(() => {
      if (testConfig.skipIntegrationTests) {
        pending('Integration tests skipped');
      }
    });

    it('should connect to blockchain network', async () => {
      const isConnected = await web3Service.isConnected();
      expect(isConnected).toBe(true);
    }, 10000);

    it('should get network information', async () => {
      const [networkId, blockNumber] = await Promise.all([
        web3Service.getNetworkId(),
        web3Service.getCurrentBlock()
      ]);

      expect(typeof networkId).toBe('bigint');
      expect(typeof blockNumber).toBe('bigint');
      expect(blockNumber).toBeGreaterThan(BigInt(0));
    }, 10000);

    it('should get gas price information', async () => {
      const gasPrice = await web3Service.getGasPrice();
      expect(typeof gasPrice).toBe('bigint');
      expect(gasPrice).toBeGreaterThan(BigInt(0));
    }, 10000);

    it('should assess network congestion', async () => {
      const congestion = await web3Service.getNetworkCongestion();
      
      expect(congestion.level).toMatch(/^(low|medium|high)$/);
      expect(typeof congestion.gasPrice).toBe('bigint');
      expect(typeof congestion.pendingTransactions).toBe('number');
      expect(typeof congestion.blockUtilization).toBe('number');
      expect(congestion.blockUtilization).toBeGreaterThanOrEqual(0);
      expect(congestion.blockUtilization).toBeLessThanOrEqual(1);
    }, 15000);

    it('should get optimal gas prices for different priorities', async () => {
      const [slowPrice, standardPrice, fastPrice] = await Promise.all([
        web3Service.getOptimalGasPrice('slow'),
        web3Service.getOptimalGasPrice('standard'),
        web3Service.getOptimalGasPrice('fast')
      ]);

      expect(slowPrice).toBeLessThan(standardPrice);
      expect(standardPrice).toBeLessThan(fastPrice);
    }, 10000);

    it('should handle account balance queries', async () => {
      if (!testConfig.testAccount) {
        pending('No test account provided');
      }

      const [balanceWei, balanceEther] = await Promise.all([
        web3Service.getBalance(testConfig.testAccount),
        web3Service.getBalanceInEther(testConfig.testAccount)
      ]);

      expect(typeof balanceWei).toBe('bigint');
      expect(typeof balanceEther).toBe('string');
      expect(parseFloat(balanceEther)).toBeGreaterThanOrEqual(0);
    }, 10000);

    it('should convert between wei and ether correctly', () => {
      const testEther = '1.5';
      const expectedWei = BigInt('1500000000000000000');
      
      const convertedWei = web3Service.etherToWei(testEther);
      const convertedEther = web3Service.weiToEther(expectedWei);

      expect(convertedWei).toBe(expectedWei);
      expect(convertedEther).toBe(testEther);
    });
  });

  describe('ContractService Integration', () => {
    beforeEach(() => {
      if (testConfig.skipIntegrationTests || !testConfig.contractAddress) {
        pending('Integration tests skipped or no contract address provided');
      }
    });

    it('should perform health check successfully', async () => {
      const health = await contractService.healthCheck();
      
      expect(health.isConnected).toBe(true);
      expect(health.contractAddress).toBe(testConfig.contractAddress);
      expect(typeof health.networkId).toBe('bigint');
      expect(typeof health.blockNumber).toBe('bigint');
      expect(health.error).toBeUndefined();
    }, 15000);

    it('should get contract statistics', async () => {
      const stats = await contractService.getContractStats();
      
      expect(typeof stats.totalSupply).toBe('string');
      expect(typeof stats.totalOfflineCredits).toBe('string');
      expect(typeof stats.contractBalance).toBe('string');
      expect(typeof stats.totalSupplyWei).toBe('bigint');
      expect(typeof stats.totalOfflineCreditsWei).toBe('bigint');
      expect(typeof stats.contractBalanceWei).toBe('bigint');
    }, 10000);

    it('should get user balance information', async () => {
      if (!testConfig.testAccount) {
        pending('No test account provided');
      }

      const balance = await contractService.getUserBalance(testConfig.testAccount);
      
      expect(typeof balance.balance).toBe('string');
      expect(typeof balance.offlineCredits).toBe('string');
      expect(typeof balance.balanceWei).toBe('bigint');
      expect(typeof balance.offlineCreditsWei).toBe('bigint');
      expect(parseFloat(balance.balance)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(balance.offlineCredits)).toBeGreaterThanOrEqual(0);
    }, 10000);

    it('should get user transaction history', async () => {
      if (!testConfig.testAccount) {
        pending('No test account provided');
      }

      const history = await contractService.getUserTransactionHistory(
        testConfig.testAccount,
        0,
        10
      );
      
      expect(Array.isArray(history.transactions)).toBe(true);
      expect(typeof history.totalCount).toBe('number');
      expect(history.totalCount).toBeGreaterThanOrEqual(0);
      
      // If there are transactions, validate their structure
      if (history.transactions.length > 0) {
        const tx = history.transactions[0];
        expect(typeof tx.transactionId).toBe('string');
        expect(typeof tx.user).toBe('string');
        expect(typeof tx.transactionType).toBe('string');
        expect(typeof tx.amount).toBe('string');
        expect(typeof tx.timestamp).toBe('number');
        expect(typeof tx.nonce).toBe('number');
      }
    }, 10000);

    it('should get authorized OTMs', async () => {
      const otms = await contractService.getAuthorizedOTMs();
      
      expect(Array.isArray(otms.otmAddresses)).toBe(true);
      expect(typeof otms.totalCount).toBe('number');
      expect(otms.totalCount).toBeGreaterThanOrEqual(0);
      expect(otms.otmAddresses.length).toBe(otms.totalCount);
    }, 10000);

    it('should check OTM authorization status', async () => {
      if (!testConfig.testAccount) {
        pending('No test account provided');
      }

      const isAuthorized = await contractService.isAuthorizedOTM(testConfig.testAccount);
      expect(typeof isAuthorized).toBe('boolean');
    }, 10000);

    it('should get user nonce', async () => {
      if (!testConfig.testAccount) {
        pending('No test account provided');
      }

      const nonce = await contractService.getUserNonce(testConfig.testAccount);
      expect(typeof nonce).toBe('number');
      expect(nonce).toBeGreaterThanOrEqual(0);
    }, 10000);

    it('should validate transaction nonce', async () => {
      if (!testConfig.testAccount) {
        pending('No test account provided');
      }

      const currentNonce = await contractService.getUserNonce(testConfig.testAccount);
      const isValid = await contractService.validateTransactionNonce(
        testConfig.testAccount,
        currentNonce + 1
      );
      
      expect(typeof isValid).toBe('boolean');
    }, 10000);
  });

  describe('Error Handling Integration', () => {
    beforeEach(() => {
      if (testConfig.skipIntegrationTests) {
        pending('Integration tests skipped');
      }
    });

    it('should handle invalid contract address gracefully', async () => {
      const invalidContractService = new ContractService(web3Service);
      invalidContractService.initializeContract(mockContractAbi, '0x0000000000000000000000000000000000000000');

      await expect(invalidContractService.getContractStats())
        .rejects.toThrow();
    }, 10000);

    it('should handle invalid user address gracefully', async () => {
      if (!testConfig.contractAddress) {
        pending('No contract address provided');
      }

      await expect(contractService.getUserBalance('0xinvalidaddress'))
        .rejects.toThrow();
    }, 10000);

    it('should handle network disconnection gracefully', async () => {
      // Create a service with invalid RPC URL
      const invalidWeb3Service = new Web3Service();
      // Override the network URL to an invalid one
      (invalidWeb3Service as any).networkUrl = 'http://invalid-url:8545';
      (invalidWeb3Service as any).web3 = new (web3Service.getWeb3().constructor)('http://invalid-url:8545');

      const isConnected = await invalidWeb3Service.isConnected();
      expect(isConnected).toBe(false);
    }, 10000);
  });

  describe('Performance Tests', () => {
    beforeEach(() => {
      if (testConfig.skipIntegrationTests || !testConfig.contractAddress) {
        pending('Integration tests skipped or no contract address provided');
      }
    });

    it('should handle concurrent balance queries efficiently', async () => {
      if (!testConfig.testAccount) {
        pending('No test account provided');
      }

      const startTime = Date.now();
      
      // Execute 5 concurrent balance queries
      const promises = Array(5).fill(null).map(() => 
        contractService.getUserBalance(testConfig.testAccount)
      );
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(typeof result.balance).toBe('string');
        expect(typeof result.offlineCredits).toBe('string');
      });
      
      // Should complete within reasonable time (less than 30 seconds for 5 concurrent calls)
      expect(endTime - startTime).toBeLessThan(30000);
    }, 35000);

    it('should handle batch operations efficiently', async () => {
      if (!testConfig.testAccount) {
        pending('No test account provided');
      }

      const operations = [
        {
          method: 'getBalance',
          params: [testConfig.testAccount],
          options: {}
        },
        {
          method: 'getOfflineTokenCredits',
          params: [testConfig.testAccount],
          options: {}
        }
      ];

      // Note: This test only validates the batch structure since we're not sending transactions
      const batchResult = await contractService.batchContractOperations([]);
      
      expect(Array.isArray(batchResult.successful)).toBe(true);
      expect(Array.isArray(batchResult.failed)).toBe(true);
      expect(typeof batchResult.totalGasUsed).toBe('bigint');
    }, 15000);
  });

  describe('Event Monitoring Integration', () => {
    beforeEach(() => {
      if (testConfig.skipIntegrationTests || !testConfig.contractAddress) {
        pending('Integration tests skipped or no contract address provided');
      }
    });

    it('should fetch contract events successfully', async () => {
      const currentBlock = await web3Service.getCurrentBlock();
      const fromBlock = Math.max(0, Number(currentBlock) - 1000); // Last 1000 blocks
      
      const events = await contractService.getContractEvents(
        'TokensPurchased',
        fromBlock,
        'latest'
      );
      
      expect(Array.isArray(events)).toBe(true);
      
      // If events exist, validate their structure
      if (events.length > 0) {
        const event = events[0];
        expect(typeof event.event).toBe('string');
        expect(typeof event.blockNumber).toBe('number');
        expect(typeof event.transactionHash).toBe('string');
        expect(typeof event.returnValues).toBe('object');
      }
    }, 15000);

    it('should handle event queries for non-existent events', async () => {
      const events = await contractService.getContractEvents(
        'NonExistentEvent',
        0,
        'latest'
      );
      
      expect(Array.isArray(events)).toBe(true);
      expect(events).toHaveLength(0);
    }, 10000);
  });

  describe('Gas Optimization Integration', () => {
    beforeEach(() => {
      if (testConfig.skipIntegrationTests) {
        pending('Integration tests skipped');
      }
    });

    it('should provide accurate gas estimates', async () => {
      const mockTransaction = {
        to: '0x742d35Cc6634C0532925a3b8D4C9db96590c6C8b',
        value: '1000000000000000000', // 1 ETH
        data: '0x'
      };

      const gasEstimate = await web3Service.estimateGas(mockTransaction);
      
      expect(typeof gasEstimate).toBe('bigint');
      expect(gasEstimate).toBeGreaterThan(BigInt(0));
      expect(gasEstimate).toBeLessThan(BigInt(1000000)); // Reasonable upper bound
    }, 10000);

    it('should optimize gas prices based on network conditions', async () => {
      const congestion = await web3Service.getNetworkCongestion();
      const optimalPrice = await web3Service.getOptimalGasPrice('standard');
      
      // Gas price should be reasonable based on network conditions
      if (congestion.level === 'high') {
        expect(optimalPrice).toBeGreaterThan(congestion.gasPrice);
      } else if (congestion.level === 'low') {
        expect(optimalPrice).toBeLessThanOrEqual(congestion.gasPrice * BigInt(2));
      }
    }, 10000);
  });
});