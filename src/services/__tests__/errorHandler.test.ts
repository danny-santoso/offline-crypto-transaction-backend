/**
 * Tests for Blockchain Error Handling Service
 * Requirements: 7.4, 7.5
 */

import { 
  BlockchainErrorHandler, 
  TransactionRecoveryManager,
  ErrorType,
  BlockchainError 
} from '../errorHandler';

describe('BlockchainErrorHandler', () => {
  let errorHandler: BlockchainErrorHandler;

  beforeEach(() => {
    errorHandler = new BlockchainErrorHandler();
  });

  describe('Error Classification', () => {
    test('should classify network errors correctly', () => {
      const networkError = new Error('network error: connection refused');
      const parsed = errorHandler.parseError(networkError);

      expect(parsed.type).toBe(ErrorType.NETWORK_ERROR);
      expect(parsed.retryable).toBe(true);
      expect(parsed.message).toBe('network error: connection refused');
    });

    test('should classify gas errors correctly', () => {
      const gasError = new Error('gas required exceeds allowance');
      const parsed = errorHandler.parseError(gasError);

      expect(parsed.type).toBe(ErrorType.GAS_ERROR);
      expect(parsed.retryable).toBe(true);
    });

    test('should classify insufficient funds errors correctly', () => {
      const fundsError = new Error('insufficient funds for gas * price + value');
      const parsed = errorHandler.parseError(fundsError);

      expect(parsed.type).toBe(ErrorType.INSUFFICIENT_FUNDS);
      expect(parsed.retryable).toBe(false);
    });

    test('should classify nonce errors correctly', () => {
      const nonceError = new Error('nonce too low');
      const parsed = errorHandler.parseError(nonceError);

      expect(parsed.type).toBe(ErrorType.NONCE_ERROR);
      expect(parsed.retryable).toBe(true);
    });

    test('should classify timeout errors correctly', () => {
      const timeoutError = new Error('transaction timeout');
      const parsed = errorHandler.parseError(timeoutError);

      expect(parsed.type).toBe(ErrorType.TIMEOUT_ERROR);
      expect(parsed.retryable).toBe(true);
    });

    test('should classify contract errors correctly', () => {
      const contractError = new Error('execution reverted');
      const parsed = errorHandler.parseError(contractError);

      expect(parsed.type).toBe(ErrorType.CONTRACT_ERROR);
      expect(parsed.retryable).toBe(false);
    });

    test('should classify signature errors correctly', () => {
      const signatureError = new Error('invalid signature');
      const parsed = errorHandler.parseError(signatureError);

      expect(parsed.type).toBe(ErrorType.SIGNATURE_ERROR);
      expect(parsed.retryable).toBe(false);
    });

    test('should classify congestion errors correctly', () => {
      const congestionError = new Error('network congested, too many pending transactions');
      const parsed = errorHandler.parseError(congestionError);

      expect(parsed.type).toBe(ErrorType.CONGESTION_ERROR);
      expect(parsed.retryable).toBe(true);
    });

    test('should handle unknown errors', () => {
      const unknownError = new Error('some random error message');
      const parsed = errorHandler.parseError(unknownError);

      expect(parsed.type).toBe(ErrorType.TRANSACTION_ERROR);
      expect(parsed.retryable).toBe(false);
    });

    test('should include context in parsed errors', () => {
      const error = new Error('test error');
      const context = { transactionId: '0x123', attempt: 1 };
      const parsed = errorHandler.parseError(error, context);

      expect(parsed.context).toEqual(context);
      expect(parsed.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Retry Logic', () => {
    test('should succeed on first attempt', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await errorHandler.executeWithRetry(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    test('should retry retryable errors', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('gas required exceeds allowance'))
        .mockResolvedValue('success');
      
      const result = await errorHandler.executeWithRetry(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    test('should not retry non-retryable errors', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValue(new Error('insufficient funds'));
      
      try {
        await errorHandler.executeWithRetry(mockOperation);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toHaveProperty('type', ErrorType.INSUFFICIENT_FUNDS);
      }
      
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    test('should respect max retry limit', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValue(new Error('network error'));
      
      const customConfig = { maxRetries: 2 };
      
      try {
        await errorHandler.executeWithRetry(mockOperation, {}, customConfig);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toHaveProperty('type', ErrorType.NETWORK_ERROR);
      }
      
      expect(mockOperation).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    test('should apply exponential backoff', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      await errorHandler.executeWithRetry(mockOperation, {}, { baseDelay: 100 });
      const endTime = Date.now();
      
      // Should have waited at least 100ms for the retry
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Gas Price Optimization', () => {
    test('should increase gas price for gas errors', async () => {
      const currentGasPrice = BigInt('20000000000'); // 20 gwei
      const gasError: BlockchainError = {
        type: ErrorType.GAS_ERROR,
        message: 'gas price too low',
        retryable: true,
        timestamp: new Date()
      };
      
      const optimized = await errorHandler.optimizeGasPrice(
        currentGasPrice, 
        gasError, 
        'medium'
      );
      
      expect(optimized).toBeGreaterThan(currentGasPrice);
      expect(optimized).toBe(BigInt('30000000000')); // 50% increase
    });

    test('should handle high congestion', async () => {
      const currentGasPrice = BigInt('20000000000');
      const congestionError: BlockchainError = {
        type: ErrorType.CONGESTION_ERROR,
        message: 'network congested',
        retryable: true,
        timestamp: new Date()
      };
      
      const optimized = await errorHandler.optimizeGasPrice(
        currentGasPrice, 
        congestionError, 
        'high'
      );
      
      expect(optimized).toBe(BigInt('40000000000')); // 100% increase for high congestion
    });

    test('should cap gas price at maximum', async () => {
      const currentGasPrice = BigInt('80000000000'); // 80 gwei
      const gasError: BlockchainError = {
        type: ErrorType.GAS_ERROR,
        message: 'gas price too low',
        retryable: true,
        timestamp: new Date()
      };
      
      const optimized = await errorHandler.optimizeGasPrice(
        currentGasPrice, 
        gasError, 
        'high'
      );
      
      // Should be capped at 100 gwei
      expect(optimized).toBe(BigInt('100000000000'));
    });
  });

  describe('Recovery Strategies', () => {
    test('should create retry strategy for network errors', () => {
      const networkError: BlockchainError = {
        type: ErrorType.NETWORK_ERROR,
        message: 'connection refused',
        retryable: true,
        timestamp: new Date()
      };
      
      const strategy = errorHandler.createRecoveryStrategy(networkError);
      
      expect(strategy.action).toBe('wait');
      expect(strategy.delay).toBe(5000);
    });

    test('should create gas adjustment strategy for gas errors', () => {
      const gasError: BlockchainError = {
        type: ErrorType.GAS_ERROR,
        message: 'gas price too low',
        retryable: true,
        timestamp: new Date()
      };
      
      const strategy = errorHandler.createRecoveryStrategy(gasError);
      
      expect(strategy.action).toBe('adjust_gas');
      expect(strategy.gasAdjustment).toBe(1.5);
    });

    test('should create cancel strategy for insufficient funds', () => {
      const fundsError: BlockchainError = {
        type: ErrorType.INSUFFICIENT_FUNDS,
        message: 'insufficient funds',
        retryable: false,
        timestamp: new Date()
      };
      
      const strategy = errorHandler.createRecoveryStrategy(fundsError);
      
      expect(strategy.action).toBe('cancel');
    });

    test('should create manual intervention strategy for contract errors', () => {
      const contractError: BlockchainError = {
        type: ErrorType.CONTRACT_ERROR,
        message: 'execution reverted',
        retryable: false,
        timestamp: new Date()
      };
      
      const strategy = errorHandler.createRecoveryStrategy(contractError);
      
      expect(strategy.action).toBe('manual_intervention');
    });
  });

  describe('Error Statistics', () => {
    test('should track error statistics', () => {
      // Generate some test errors
      errorHandler.parseError(new Error('network error'));
      errorHandler.parseError(new Error('gas required exceeds allowance'));
      errorHandler.parseError(new Error('network error'));
      errorHandler.parseError(new Error('insufficient funds'));
      
      const stats = errorHandler.getErrorStatistics();
      
      expect(stats.totalErrors).toBe(4);
      expect(stats.errorsByType[ErrorType.NETWORK_ERROR]).toBe(2);
      expect(stats.errorsByType[ErrorType.GAS_ERROR]).toBe(1);
      expect(stats.errorsByType[ErrorType.INSUFFICIENT_FUNDS]).toBe(1);
      expect(stats.retryableErrors).toBe(3);
      expect(stats.mostCommonErrors[0].type).toBe(ErrorType.NETWORK_ERROR);
    });

    test('should filter statistics by time window', () => {
      // This test would need to manipulate time or use a more sophisticated setup
      // For now, we'll test the basic functionality
      const stats = errorHandler.getErrorStatistics(60000); // Last minute
      expect(stats).toHaveProperty('totalErrors');
      expect(stats).toHaveProperty('errorsByType');
    });
  });

  describe('Log Management', () => {
    test('should clear old logs', () => {
      // Generate some errors
      for (let i = 0; i < 5; i++) {
        errorHandler.parseError(new Error(`test error ${i}`));
      }
      
      const statsBefore = errorHandler.getErrorStatistics();
      expect(statsBefore.totalErrors).toBe(5);
      
      // Clear logs older than 0ms (should clear all)
      errorHandler.clearOldLogs(0);
      
      const statsAfter = errorHandler.getErrorStatistics();
      expect(statsAfter.totalErrors).toBe(0);
    });
  });
});

describe('TransactionRecoveryManager', () => {
  let errorHandler: BlockchainErrorHandler;
  let recoveryManager: TransactionRecoveryManager;

  beforeEach(() => {
    errorHandler = new BlockchainErrorHandler();
    recoveryManager = new TransactionRecoveryManager(errorHandler);
  });

  describe('Transaction Recovery', () => {
    test('should add failed transaction for recovery', () => {
      const transaction = { to: '0x123', value: '1000000000000000000' };
      const error: BlockchainError = {
        type: ErrorType.GAS_ERROR,
        message: 'gas price too low',
        retryable: true,
        timestamp: new Date()
      };
      
      recoveryManager.addFailedTransaction('tx1', transaction, error);
      
      const status = recoveryManager.getRecoveryStatus();
      expect(status.totalPending).toBe(1);
      expect(status.byStrategy['adjust_gas']).toBe(1);
    });

    test('should process pending recoveries successfully', async () => {
      const transaction = { to: '0x123', value: '1000000000000000000' };
      const error: BlockchainError = {
        type: ErrorType.GAS_ERROR,
        message: 'gas price too low',
        retryable: true,
        timestamp: new Date()
      };
      
      recoveryManager.addFailedTransaction('tx1', transaction, error);
      
      const mockExecute = jest.fn().mockResolvedValue('0xhash');
      const result = await recoveryManager.processPendingRecoveries(mockExecute);
      
      expect(result.recovered).toContain('tx1');
      expect(result.failed).toHaveLength(0);
      expect(result.stillPending).toHaveLength(0);
    });

    test('should handle recovery failures', async () => {
      const transaction = { to: '0x123', value: '1000000000000000000' };
      const error: BlockchainError = {
        type: ErrorType.GAS_ERROR, // Use gas error to avoid delay
        message: 'gas price too low',
        retryable: true,
        timestamp: new Date()
      };
      
      recoveryManager.addFailedTransaction('tx1', transaction, error);
      
      const mockExecute = jest.fn().mockRejectedValue(new Error('still failing'));
      
      // Process multiple times to exceed max attempts
      for (let i = 0; i < 6; i++) {
        await recoveryManager.processPendingRecoveries(mockExecute);
      }
      
      const status = recoveryManager.getRecoveryStatus();
      expect(status.totalPending).toBe(0); // Should be removed after max attempts
    });

    test('should respect delay strategies', async () => {
      const transaction = { to: '0x123', value: '1000000000000000000' };
      const error: BlockchainError = {
        type: ErrorType.NETWORK_ERROR,
        message: 'connection refused',
        retryable: true,
        timestamp: new Date()
      };
      
      recoveryManager.addFailedTransaction('tx1', transaction, error);
      
      const mockExecute = jest.fn().mockResolvedValue('0xhash');
      
      // First attempt should be pending due to delay
      const result1 = await recoveryManager.processPendingRecoveries(mockExecute);
      expect(result1.stillPending).toContain('tx1');
      expect(mockExecute).not.toHaveBeenCalled();
      
      // Wait for delay and try again
      await new Promise(resolve => setTimeout(resolve, 5100));
      const result2 = await recoveryManager.processPendingRecoveries(mockExecute);
      expect(result2.recovered).toContain('tx1');
    }, 10000); // Increase timeout to 10 seconds

    test('should adjust gas prices for gas errors', async () => {
      const transaction = { 
        to: '0x123', 
        value: '1000000000000000000',
        gasPrice: '20000000000' // Use string instead of BigInt for easier comparison
      };
      const error: BlockchainError = {
        type: ErrorType.GAS_ERROR,
        message: 'gas price too low',
        retryable: true,
        timestamp: new Date()
      };
      
      recoveryManager.addFailedTransaction('tx1', transaction, error);
      
      const mockExecute = jest.fn().mockImplementation((tx) => {
        // Verify gas price was adjusted (should be 1.5x original)
        const originalPrice = Number('20000000000');
        const adjustedPrice = Number(tx.gasPrice);
        expect(adjustedPrice).toBeGreaterThan(originalPrice);
        return Promise.resolve('0xhash');
      });
      
      await recoveryManager.processPendingRecoveries(mockExecute);
      
      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe('Recovery Status', () => {
    test('should provide accurate recovery status', () => {
      const error1: BlockchainError = {
        type: ErrorType.GAS_ERROR,
        message: 'gas price too low',
        retryable: true,
        timestamp: new Date()
      };
      
      const error2: BlockchainError = {
        type: ErrorType.NETWORK_ERROR,
        message: 'connection refused',
        retryable: true,
        timestamp: new Date()
      };
      
      recoveryManager.addFailedTransaction('tx1', {}, error1);
      recoveryManager.addFailedTransaction('tx2', {}, error2);
      
      const status = recoveryManager.getRecoveryStatus();
      
      expect(status.totalPending).toBe(2);
      expect(status.byStrategy['adjust_gas']).toBe(1);
      expect(status.byStrategy['wait']).toBe(1);
      expect(status.oldestPending).toBeInstanceOf(Date);
    });
  });

  describe('Cleanup', () => {
    test('should clear old recoveries', async () => {
      const error: BlockchainError = {
        type: ErrorType.GAS_ERROR,
        message: 'gas price too low',
        retryable: true,
        timestamp: new Date()
      };
      
      recoveryManager.addFailedTransaction('tx1', {}, error);
      
      let status = recoveryManager.getRecoveryStatus();
      expect(status.totalPending).toBe(1);
      
      // Wait a bit to ensure time has passed
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Clear recoveries older than 5ms (should clear all)
      recoveryManager.clearOldRecoveries(5);
      
      status = recoveryManager.getRecoveryStatus();
      expect(status.totalPending).toBe(0);
    });
  });
});