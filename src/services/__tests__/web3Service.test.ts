import { Web3Service } from '../web3Service';

// Mock Web3 to avoid actual network calls in tests
jest.mock('web3', () => {
  return {
    Web3: jest.fn().mockImplementation(() => ({
      eth: {
        getBlockNumber: jest.fn().mockResolvedValue(BigInt(12345)),
        getChainId: jest.fn().mockResolvedValue(BigInt(1337)),
        getBalance: jest.fn().mockResolvedValue(BigInt('1000000000000000000')), // 1 ETH in Wei
        getGasPrice: jest.fn().mockResolvedValue(BigInt('20000000000')), // 20 Gwei
        estimateGas: jest.fn().mockResolvedValue(BigInt(21000)),
        getTransactionReceipt: jest.fn().mockResolvedValue({
          blockNumber: BigInt(12345),
          status: BigInt(1),
          transactionHash: '0x123...',
        }),
      },
      utils: {
        fromWei: jest.fn().mockImplementation((value, unit) => {
          if (unit === 'ether') {
            return '1.0'; // Mock 1 ETH
          }
          return value.toString();
        }),
        toWei: jest.fn().mockImplementation((value, unit) => {
          if (unit === 'ether') {
            return BigInt('1000000000000000000'); // 1 ETH in Wei
          }
          return BigInt(value);
        }),
      },
    })),
  };
});

describe('Web3Service', () => {
  let web3Service: Web3Service;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    web3Service = new Web3Service();
  });

  describe('Connection Tests', () => {
    it('should check if connected to Ethereum network', async () => {
      const isConnected = await web3Service.isConnected();
      expect(isConnected).toBe(true);
    });

    it('should get network ID', async () => {
      const networkId = await web3Service.getNetworkId();
      expect(networkId).toBe(BigInt(1337));
    });

    it('should get current block number', async () => {
      const blockNumber = await web3Service.getCurrentBlock();
      expect(blockNumber).toBe(BigInt(12345));
    });
  });

  describe('Balance Tests', () => {
    const testAddress = '0x742d35Cc6634C0532925a3b8D4C9db96590c6C8b';

    it('should get balance in Wei', async () => {
      const balance = await web3Service.getBalance(testAddress);
      expect(balance).toBe(BigInt('1000000000000000000'));
    });

    it('should get balance in Ether', async () => {
      const balance = await web3Service.getBalanceInEther(testAddress);
      expect(balance).toBe('1.0');
    });
  });

  describe('Utility Functions', () => {
    it('should convert Wei to Ether', () => {
      const ether = web3Service.weiToEther(BigInt('1000000000000000000'));
      expect(ether).toBe('1.0');
    });

    it('should convert Ether to Wei', () => {
      const wei = web3Service.etherToWei('1.0');
      expect(wei).toBe(BigInt('1000000000000000000'));
    });
  });

  describe('Gas and Transaction Tests', () => {
    it('should get gas price', async () => {
      const gasPrice = await web3Service.getGasPrice();
      expect(gasPrice).toBe(BigInt('20000000000'));
    });

    it('should estimate gas', async () => {
      const mockTransaction = { to: '0x123...', value: '1000000000000000000' };
      const gasEstimate = await web3Service.estimateGas(mockTransaction);
      expect(gasEstimate).toBe(BigInt(21000));
    });

    it('should get transaction receipt', async () => {
      const txHash = '0x123...';
      const receipt = await web3Service.getTransactionReceipt(txHash);
      expect(receipt).toHaveProperty('blockNumber');
      expect(receipt).toHaveProperty('status');
      expect(receipt).toHaveProperty('transactionHash');
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      // Mock a connection error
      const web3Instance = web3Service.getWeb3();
      jest.spyOn(web3Instance.eth, 'getBlockNumber').mockRejectedValueOnce(new Error('Network error'));

      const isConnected = await web3Service.isConnected();
      expect(isConnected).toBe(false);
    });
  });
});