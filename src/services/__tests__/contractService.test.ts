import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { ContractService } from '../contractService';
import { Web3Service } from '../web3Service';

// Mock Web3Service
jest.mock('../web3Service');

describe('ContractService', () => {
  let contractService: ContractService;
  let mockWeb3Service: jest.Mocked<Web3Service>;
  let mockContract: any;

  const mockAbi = [
    { name: 'purchaseOfflineTokens', type: 'function' },
    { name: 'redeemOfflineTokens', type: 'function' },
    { name: 'validateTokenSignature', type: 'function' },
    { name: 'getBalance', type: 'function' },
    { name: 'getOfflineTokenCredits', type: 'function' }
  ];
  const mockAddress = '0x742d35Cc6634C0532925a3b8D4C9db96590c6C8b';
  const mockUserAddress = '0x123456789abcdef123456789abcdef123456789a';

  beforeEach(() => {
    // Create mock contract
    mockContract = {
      methods: {
        purchaseOfflineTokens: jest.fn().mockReturnValue({
          estimateGas: jest.fn().mockResolvedValue(BigInt(50000)),
          send: jest.fn().mockResolvedValue('0xtxhash')
        }),
        redeemOfflineTokens: jest.fn().mockReturnValue({
          estimateGas: jest.fn().mockResolvedValue(BigInt(45000)),
          send: jest.fn().mockResolvedValue('0xtxhash2')
        }),
        validateTokenSignature: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(true),
          estimateGas: jest.fn().mockResolvedValue(BigInt(60000)),
          send: jest.fn().mockResolvedValue('0xtxhash3')
        }),
        getBalance: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(BigInt('1000000000000000000'))
        }),
        getOfflineTokenCredits: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(BigInt('2000000000000000000'))
        }),
        getUserTransactionHistoryPaginated: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue([])
        }),
        getUserTransactionCount: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(BigInt(5))
        }),
        getAuthorizedOTMs: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue([mockAddress])
        }),
        getAuthorizedOTMCount: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(BigInt(1))
        }),
        isAuthorizedOTM: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(true)
        }),
        getTotalSupply: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(BigInt('10000000000000000000'))
        }),
        getTotalOfflineCredits: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(BigInt('5000000000000000000'))
        }),
        getContractBalance: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(BigInt('8000000000000000000'))
        }),
        getUserNonce: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(BigInt(10))
        }),
        validateTransactionNonce: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(true)
        }),
        isSignatureUsed: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(false)
        })
      },
      getPastEvents: jest.fn().mockResolvedValue([])
    };

    // Create mock Web3Service
    mockWeb3Service = {
      createContract: jest.fn().mockReturnValue(mockContract),
      etherToWei: jest.fn().mockImplementation((ether) => {
        const etherNum = parseFloat(ether);
        return BigInt(Math.floor(etherNum * 1e18));
      }),
      weiToEther: jest.fn().mockImplementation((wei) => (BigInt(wei) / BigInt('1000000000000000000')).toString()),
      getOptimalGasPrice: jest.fn().mockResolvedValue(BigInt('20000000000')),
      sendContractTransaction: jest.fn().mockResolvedValue('0xtxhash'),
      monitorTransaction: jest.fn().mockResolvedValue({
        status: 'success',
        receipt: { status: true, gasUsed: BigInt(50000) },
        gasUsed: BigInt(50000)
      }),
      callContractMethod: jest.fn(),
      isConnected: jest.fn().mockResolvedValue(true),
      getNetworkId: jest.fn().mockResolvedValue(BigInt(1337)),
      getCurrentBlock: jest.fn().mockResolvedValue(BigInt(12345)),
      getBalance: jest.fn().mockResolvedValue(BigInt('5000000000000000000')),
      getTransactionReceipt: jest.fn().mockResolvedValue({
        status: true,
        gasUsed: BigInt(50000),
        blockNumber: BigInt(12345)
      }),
      getWeb3: jest.fn().mockReturnValue({
        utils: {
          keccak256: jest.fn().mockReturnValue('0xabcdef123456789')
        }
      })
    } as any;

    contractService = new ContractService(mockWeb3Service);
  });

  describe('Contract Initialization', () => {
    it('should initialize contract successfully', () => {
      contractService.initializeContract(mockAbi, mockAddress);

      expect(mockWeb3Service.createContract).toHaveBeenCalledWith(mockAbi, mockAddress);
      expect(contractService.getContract()).toBe(mockContract);
      expect(contractService.getContractAddress()).toBe(mockAddress);
    });

    it('should throw error when contract not initialized', async () => {
      await expect(contractService.purchaseOfflineTokens(mockUserAddress, '1.0'))
        .rejects.toThrow('Contract not initialized');
    });
  });

  describe('Purchase Offline Tokens', () => {
    beforeEach(() => {
      contractService.initializeContract(mockAbi, mockAddress);
    });

    it('should purchase offline tokens successfully', async () => {
      const result = await contractService.purchaseOfflineTokens(mockUserAddress, '1.0');

      expect(result.transactionHash).toBe('0xtxhash');
      expect(result.gasUsed).toBe(BigInt(50000));
      expect(mockWeb3Service.etherToWei).toHaveBeenCalledWith('1.0');
      expect(mockWeb3Service.sendContractTransaction).toHaveBeenCalled();
      expect(mockWeb3Service.monitorTransaction).toHaveBeenCalledWith('0xtxhash', 300000, 2);
    });

    it('should handle purchase transaction failure', async () => {
      mockWeb3Service.monitorTransaction.mockResolvedValueOnce({
        status: 'failed',
        receipt: { status: false },
        confirmations: 0,
        gasUsed: BigInt(0)
      });

      await expect(contractService.purchaseOfflineTokens(mockUserAddress, '1.0'))
        .rejects.toThrow('Transaction failed with status: failed');
    });

    it('should handle gas estimation errors', async () => {
      mockContract.methods.purchaseOfflineTokens.mockReturnValue({
        estimateGas: jest.fn().mockRejectedValue(new Error('Gas estimation failed'))
      });

      await expect(contractService.purchaseOfflineTokens(mockUserAddress, '1.0'))
        .rejects.toThrow('Gas estimation failed');
    });
  });

  describe('Redeem Offline Tokens', () => {
    beforeEach(() => {
      contractService.initializeContract(mockAbi, mockAddress);
    });

    it('should redeem offline tokens successfully', async () => {
      const result = await contractService.redeemOfflineTokens(mockUserAddress, '0.5');

      expect(result.transactionHash).toBe('0xtxhash');
      expect(result.gasUsed).toBe(BigInt(50000));
      expect(mockWeb3Service.etherToWei).toHaveBeenCalledWith('0.5');
      expect(mockWeb3Service.sendContractTransaction).toHaveBeenCalled();
    });

    it('should handle redemption transaction timeout', async () => {
      mockWeb3Service.monitorTransaction.mockResolvedValueOnce({
        status: 'timeout',
        receipt: null,
        confirmations: 0,
        gasUsed: BigInt(0)
      });

      await expect(contractService.redeemOfflineTokens(mockUserAddress, '0.5'))
        .rejects.toThrow('Transaction failed with status: timeout');
    });
  });

  describe('Token Signature Validation', () => {
    beforeEach(() => {
      contractService.initializeContract(mockAbi, mockAddress);
    });

    it('should validate token signature successfully', async () => {
      mockWeb3Service.callContractMethod.mockResolvedValueOnce(true);

      const result = await contractService.validateTokenSignature(
        '0xsignature',
        '1.0',
        'token123',
        mockAddress,
        1,
        mockUserAddress
      );

      expect(result.isValid).toBe(true);
      expect(result.transactionHash).toBe('0xtxhash');
      expect(mockWeb3Service.callContractMethod).toHaveBeenCalled();
      expect(mockWeb3Service.sendContractTransaction).toHaveBeenCalled();
    });

    it('should handle invalid signature', async () => {
      mockWeb3Service.callContractMethod.mockResolvedValueOnce(false);

      const result = await contractService.validateTokenSignature(
        '0xinvalidsignature',
        '1.0',
        'token123',
        mockAddress,
        1,
        mockUserAddress
      );

      expect(result.isValid).toBe(false);
      expect(result.transactionHash).toBeUndefined();
    });

    it('should handle validation errors gracefully', async () => {
      mockWeb3Service.callContractMethod.mockRejectedValueOnce(new Error('Validation error'));

      const result = await contractService.validateTokenSignature(
        '0xsignature',
        '1.0',
        'token123',
        mockAddress,
        1,
        mockUserAddress
      );

      expect(result.isValid).toBe(false);
    });
  });

  describe('User Balance Operations', () => {
    beforeEach(() => {
      contractService.initializeContract(mockAbi, mockAddress);
    });

    it('should get user balance successfully', async () => {
      mockWeb3Service.callContractMethod
        .mockResolvedValueOnce(BigInt('1000000000000000000')) // balance
        .mockResolvedValueOnce(BigInt('2000000000000000000')); // offline credits

      const result = await contractService.getUserBalance(mockUserAddress);

      expect(result.balance).toBe('1');
      expect(result.offlineCredits).toBe('2');
      expect(result.balanceWei).toBe(BigInt('1000000000000000000'));
      expect(result.offlineCreditsWei).toBe(BigInt('2000000000000000000'));
    });

    it('should handle balance fetch errors', async () => {
      mockWeb3Service.callContractMethod.mockRejectedValue(new Error('Balance fetch failed'));

      await expect(contractService.getUserBalance(mockUserAddress))
        .rejects.toThrow('Balance fetch failed');
    });
  });

  describe('Transaction History', () => {
    beforeEach(() => {
      contractService.initializeContract(mockAbi, mockAddress);
    });

    it('should get user transaction history successfully', async () => {
      const mockTransactions = [
        {
          transactionId: '0xabc123',
          user: mockUserAddress,
          transactionType: 'purchase',
          amount: BigInt('1000000000000000000'),
          timestamp: BigInt(1640995200),
          nonce: BigInt(1),
          blockHash: '0xblock123'
        }
      ];

      mockWeb3Service.callContractMethod
        .mockResolvedValueOnce(mockTransactions) // transactions
        .mockResolvedValueOnce(BigInt(5)); // total count

      const result = await contractService.getUserTransactionHistory(mockUserAddress, 0, 10);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].transactionType).toBe('purchase');
      expect(result.transactions[0].amount).toBe('1');
      expect(result.totalCount).toBe(5);
    });

    it('should handle pagination correctly', async () => {
      mockWeb3Service.callContractMethod
        .mockResolvedValueOnce([]) // transactions
        .mockResolvedValueOnce(BigInt(0)); // total count

      await contractService.getUserTransactionHistory(mockUserAddress, 10, 50);

      expect(mockWeb3Service.callContractMethod).toHaveBeenCalledWith(
        mockContract,
        'getUserTransactionHistoryPaginated',
        [mockUserAddress, 10, 50]
      );
    });

    it('should limit maximum page size', async () => {
      mockWeb3Service.callContractMethod
        .mockResolvedValueOnce([]) // transactions
        .mockResolvedValueOnce(BigInt(0)); // total count

      await contractService.getUserTransactionHistory(mockUserAddress, 0, 200);

      expect(mockWeb3Service.callContractMethod).toHaveBeenCalledWith(
        mockContract,
        'getUserTransactionHistoryPaginated',
        [mockUserAddress, 0, 100] // Limited to 100
      );
    });
  });

  describe('OTM Management', () => {
    beforeEach(() => {
      contractService.initializeContract(mockAbi, mockAddress);
    });

    it('should get authorized OTMs successfully', async () => {
      mockWeb3Service.callContractMethod
        .mockResolvedValueOnce([mockAddress, '0xotm2']) // OTM addresses
        .mockResolvedValueOnce(BigInt(2)); // total count

      const result = await contractService.getAuthorizedOTMs();

      expect(result.otmAddresses).toEqual([mockAddress, '0xotm2']);
      expect(result.totalCount).toBe(2);
    });

    it('should check OTM authorization status', async () => {
      mockWeb3Service.callContractMethod.mockResolvedValueOnce(true);

      const result = await contractService.isAuthorizedOTM(mockAddress);

      expect(result).toBe(true);
      expect(mockWeb3Service.callContractMethod).toHaveBeenCalledWith(
        mockContract,
        'isAuthorizedOTM',
        [mockAddress]
      );
    });

    it('should handle OTM check errors gracefully', async () => {
      mockWeb3Service.callContractMethod.mockRejectedValue(new Error('Network error'));

      const result = await contractService.isAuthorizedOTM(mockAddress);

      expect(result).toBe(false);
    });
  });

  describe('Contract Statistics', () => {
    beforeEach(() => {
      contractService.initializeContract(mockAbi, mockAddress);
    });

    it('should get contract statistics successfully', async () => {
      mockWeb3Service.callContractMethod
        .mockResolvedValueOnce(BigInt('10000000000000000000')) // total supply
        .mockResolvedValueOnce(BigInt('5000000000000000000'))  // offline credits
        .mockResolvedValueOnce(BigInt('8000000000000000000')); // contract balance

      const result = await contractService.getContractStats();

      expect(result.totalSupply).toBe('10');
      expect(result.totalOfflineCredits).toBe('5');
      expect(result.contractBalance).toBe('8');
      expect(result.totalSupplyWei).toBe(BigInt('10000000000000000000'));
    });
  });

  describe('Nonce Management', () => {
    beforeEach(() => {
      contractService.initializeContract(mockAbi, mockAddress);
    });

    it('should get user nonce successfully', async () => {
      mockWeb3Service.callContractMethod.mockResolvedValueOnce(BigInt(15));

      const result = await contractService.getUserNonce(mockUserAddress);

      expect(result).toBe(15);
    });

    it('should validate transaction nonce', async () => {
      mockWeb3Service.callContractMethod.mockResolvedValueOnce(true);

      const result = await contractService.validateTransactionNonce(mockUserAddress, 16);

      expect(result).toBe(true);
      expect(mockWeb3Service.callContractMethod).toHaveBeenCalledWith(
        mockContract,
        'validateTransactionNonce',
        [mockUserAddress, 16]
      );
    });

    it('should check signature usage', async () => {
      mockWeb3Service.callContractMethod.mockResolvedValueOnce(false);

      const result = await contractService.isSignatureUsed('0xsighash');

      expect(result).toBe(false);
    });
  });

  describe('Batch Operations', () => {
    beforeEach(() => {
      contractService.initializeContract(mockAbi, mockAddress);
    });

    it('should execute batch operations successfully', async () => {
      const operations = [
        {
          method: 'purchaseOfflineTokens',
          params: ['1000000000000000000'],
          options: { from: mockUserAddress }
        },
        {
          method: 'redeemOfflineTokens',
          params: ['500000000000000000'],
          options: { from: mockUserAddress }
        }
      ];

      mockWeb3Service.sendContractTransaction
        .mockResolvedValueOnce('0xtx1')
        .mockResolvedValueOnce('0xtx2');

      mockWeb3Service.monitorTransaction
        .mockResolvedValueOnce({ status: 'success', receipt: {}, confirmations: 1, gasUsed: BigInt(50000) })
        .mockResolvedValueOnce({ status: 'success', receipt: {}, confirmations: 1, gasUsed: BigInt(45000) });

      const result = await contractService.batchContractOperations(operations);

      expect(result.successful).toEqual(['0xtx1', '0xtx2']);
      expect(result.failed).toHaveLength(0);
      expect(result.totalGasUsed).toBe(BigInt(95000));
    });

    it('should handle mixed success and failure in batch', async () => {
      const operations = [
        {
          method: 'purchaseOfflineTokens',
          params: ['1000000000000000000'],
          options: { from: mockUserAddress }
        },
        {
          method: 'invalidMethod',
          params: [],
          options: { from: mockUserAddress }
        }
      ];

      mockWeb3Service.sendContractTransaction
        .mockResolvedValueOnce('0xtx1')
        .mockRejectedValueOnce(new Error('Invalid method'));

      mockWeb3Service.monitorTransaction
        .mockResolvedValueOnce({ status: 'success', receipt: {}, confirmations: 1, gasUsed: BigInt(50000) });

      const result = await contractService.batchContractOperations(operations);

      expect(result.successful).toEqual(['0xtx1']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('not a function');
      expect(result.totalGasUsed).toBe(BigInt(50000));
    }, 10000);
  });

  describe('Event Monitoring', () => {
    beforeEach(() => {
      contractService.initializeContract(mockAbi, mockAddress);
    });

    it('should get contract events successfully', async () => {
      const mockEvents = [
        {
          event: 'TokensPurchased',
          blockNumber: 12345,
          transactionHash: '0xtx1',
          returnValues: { user: mockUserAddress, amount: '1000000000000000000' }
        }
      ];

      mockContract.getPastEvents.mockResolvedValueOnce(mockEvents);

      const result = await contractService.getContractEvents('TokensPurchased', 12000, 'latest');

      expect(result).toHaveLength(1);
      expect(result[0].event).toBe('TokensPurchased');
      expect(result[0].blockNumber).toBe(12345);
      expect(mockContract.getPastEvents).toHaveBeenCalledWith('TokensPurchased', {
        fromBlock: 12000,
        toBlock: 'latest',
        filter: {}
      });
    });

    it('should handle event fetch errors', async () => {
      mockContract.getPastEvents.mockRejectedValue(new Error('Event fetch failed'));

      await expect(contractService.getContractEvents('TokensPurchased'))
        .rejects.toThrow('Event fetch failed');
    });
  });

  describe('Transaction Receipt with Retry', () => {
    beforeEach(() => {
      contractService.initializeContract(mockAbi, mockAddress);
    });

    it('should get transaction receipt successfully', async () => {
      const mockReceipt = { 
        status: true, 
        gasUsed: BigInt(50000),
        transactionHash: '0xtxhash',
        transactionIndex: BigInt(0),
        blockHash: '0xblockhash',
        blockNumber: BigInt(12345),
        from: '0xfrom',
        to: '0xto',
        cumulativeGasUsed: BigInt(50000)
      };
      mockWeb3Service.getTransactionReceipt.mockResolvedValueOnce(mockReceipt as any);

      const result = await contractService.getTransactionReceiptWithRetry('0xtxhash');

      expect(result).toBe(mockReceipt);
    });

    it('should retry on null receipt', async () => {
      const mockReceipt = { 
        status: true, 
        gasUsed: BigInt(50000),
        transactionHash: '0xtxhash',
        transactionIndex: BigInt(0),
        blockHash: '0xblockhash',
        blockNumber: BigInt(12345),
        from: '0xfrom',
        to: '0xto',
        cumulativeGasUsed: BigInt(50000)
      };
      mockWeb3Service.getTransactionReceipt
        .mockResolvedValueOnce(null as any)
        .mockResolvedValueOnce(mockReceipt as any);

      const result = await contractService.getTransactionReceiptWithRetry('0xtxhash', 3);

      expect(result).toBe(mockReceipt);
      expect(mockWeb3Service.getTransactionReceipt).toHaveBeenCalledTimes(2);
    });

    it('should fail after maximum retries', async () => {
      mockWeb3Service.getTransactionReceipt.mockResolvedValue(null as any);

      await expect(contractService.getTransactionReceiptWithRetry('0xtxhash', 2))
        .rejects.toThrow('Failed to get transaction receipt after 2 attempts');
    });
  });

  describe('Health Check', () => {
    beforeEach(() => {
      contractService.initializeContract(mockAbi, mockAddress);
    });

    it('should perform successful health check', async () => {
      const result = await contractService.healthCheck();

      expect(result.isConnected).toBe(true);
      expect(result.contractAddress).toBe(mockAddress);
      expect(result.networkId).toBe(BigInt(1337));
      expect(result.blockNumber).toBe(BigInt(12345));
      expect(result.contractBalance).toBe('5');
      expect(result.error).toBeUndefined();
    });

    it('should handle connection failure', async () => {
      mockWeb3Service.isConnected.mockResolvedValueOnce(false);

      const result = await contractService.healthCheck();

      expect(result.isConnected).toBe(false);
      expect(result.error).toBe('Web3 connection failed');
    });

    it('should handle health check errors', async () => {
      mockWeb3Service.isConnected.mockRejectedValue(new Error('Network error'));

      const result = await contractService.healthCheck();

      expect(result.isConnected).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle contract balance fetch failure gracefully', async () => {
      mockWeb3Service.getBalance.mockRejectedValue(new Error('Balance error'));

      const result = await contractService.healthCheck();

      expect(result.isConnected).toBe(true);
      expect(result.contractBalance).toBe(null);
    });
  });
});