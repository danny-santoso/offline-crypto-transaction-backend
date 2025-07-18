/**
 * Comprehensive Error Handling Service for Blockchain Operations
 * Requirements: 7.4, 7.5, 9.4, 9.5
 */

export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  GAS_ERROR = 'GAS_ERROR',
  TRANSACTION_ERROR = 'TRANSACTION_ERROR',
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  NONCE_ERROR = 'NONCE_ERROR',
  SIGNATURE_ERROR = 'SIGNATURE_ERROR',
  CONGESTION_ERROR = 'CONGESTION_ERROR'
}

export interface BlockchainError {
  type: ErrorType;
  message: string;
  originalError?: Error;
  transactionHash?: string;
  gasUsed?: bigint;
  gasPrice?: bigint;
  blockNumber?: bigint;
  retryable: boolean;
  retryCount?: number;
  timestamp: Date;
  context?: Record<string, any>;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: ErrorType[];
}

export class BlockchainErrorHandler {
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      ErrorType.NETWORK_ERROR,
      ErrorType.GAS_ERROR,
      ErrorType.TIMEOUT_ERROR,
      ErrorType.CONGESTION_ERROR,
      ErrorType.NONCE_ERROR
    ]
  };

  private retryConfig: RetryConfig;
  private errorLog: BlockchainError[] = [];
  private maxLogSize: number = 1000;

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = {
      ...BlockchainErrorHandler.DEFAULT_RETRY_CONFIG,
      ...retryConfig
    };
  }

  /**
   * Parse and classify blockchain errors
   * Requirements: 7.4, 7.5
   */
  public parseError(error: any, context?: Record<string, any>): BlockchainError {
    const timestamp = new Date();
    let errorType = ErrorType.TRANSACTION_ERROR;
    let message = 'Unknown blockchain error';
    let retryable = false;

    if (error instanceof Error) {
      message = error.message;
      
      // Network-related errors
      if (this.isNetworkError(error)) {
        errorType = ErrorType.NETWORK_ERROR;
        retryable = true;
      }
      // Gas-related errors
      else if (this.isGasError(error)) {
        errorType = ErrorType.GAS_ERROR;
        retryable = true;
      }
      // Insufficient funds
      else if (this.isInsufficientFundsError(error)) {
        errorType = ErrorType.INSUFFICIENT_FUNDS;
        retryable = false;
      }
      // Nonce errors
      else if (this.isNonceError(error)) {
        errorType = ErrorType.NONCE_ERROR;
        retryable = true;
      }
      // Contract execution errors (check before timeout to avoid misclassification)
      else if (this.isContractError(error)) {
        errorType = ErrorType.CONTRACT_ERROR;
        retryable = false;
      }
      // Timeout errors
      else if (this.isTimeoutError(error)) {
        errorType = ErrorType.TIMEOUT_ERROR;
        retryable = true;
      }
      // Signature errors
      else if (this.isSignatureError(error)) {
        errorType = ErrorType.SIGNATURE_ERROR;
        retryable = false;
      }
      // Network congestion
      else if (this.isCongestionError(error)) {
        errorType = ErrorType.CONGESTION_ERROR;
        retryable = true;
      }
    }

    const blockchainError: BlockchainError = {
      type: errorType,
      message,
      originalError: error instanceof Error ? error : new Error(String(error)),
      retryable,
      timestamp,
      context
    };

    this.logError(blockchainError);
    return blockchainError;
  }

  /**
   * Execute operation with retry logic
   * Requirements: 7.4, 7.5
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    context?: Record<string, any>,
    customRetryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.retryConfig, ...customRetryConfig };
    let lastError: BlockchainError | null = null;

    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const blockchainError = this.parseError(error, {
          ...context,
          attempt,
          maxRetries: config.maxRetries
        });

        lastError = blockchainError;

        // Don't retry if error is not retryable or we've exhausted attempts
        if (!blockchainError.retryable || attempt > config.maxRetries) {
          throw blockchainError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );

        console.warn(
          `Operation failed (attempt ${attempt}/${config.maxRetries + 1}): ${blockchainError.message}. Retrying in ${delay}ms...`
        );

        await this.delay(delay);
      }
    }

    throw lastError || new Error('Operation failed after all retry attempts');
  }

  /**
   * Handle gas price optimization during errors
   * Requirements: 7.4, 7.5
   */
  public async optimizeGasPrice(
    currentGasPrice: bigint,
    error: BlockchainError,
    networkCongestion: 'low' | 'medium' | 'high'
  ): Promise<bigint> {
    let multiplier = 1.1; // Default 10% increase

    switch (error.type) {
      case ErrorType.GAS_ERROR:
        multiplier = 1.5; // 50% increase for gas errors
        break;
      case ErrorType.CONGESTION_ERROR:
        multiplier = networkCongestion === 'high' ? 2.0 : 1.3;
        break;
      case ErrorType.TIMEOUT_ERROR:
        multiplier = 1.2; // 20% increase for timeouts
        break;
      default:
        multiplier = 1.1;
    }

    const optimizedPrice = BigInt(Math.floor(Number(currentGasPrice) * multiplier));
    
    // Cap at reasonable maximum (100 gwei)
    const maxGasPrice = BigInt('100000000000');
    return optimizedPrice > maxGasPrice ? maxGasPrice : optimizedPrice;
  }

  /**
   * Create recovery strategy for failed transactions
   * Requirements: 7.4, 7.5
   */
  public createRecoveryStrategy(error: BlockchainError): {
    action: 'retry' | 'adjust_gas' | 'wait' | 'cancel' | 'manual_intervention';
    delay?: number;
    gasAdjustment?: number;
    message: string;
  } {
    switch (error.type) {
      case ErrorType.NETWORK_ERROR:
        return {
          action: 'wait',
          delay: 5000,
          message: 'Network connectivity issue. Waiting before retry.'
        };

      case ErrorType.GAS_ERROR:
        return {
          action: 'adjust_gas',
          gasAdjustment: 1.5,
          message: 'Gas price too low. Increasing gas price and retrying.'
        };

      case ErrorType.CONGESTION_ERROR:
        return {
          action: 'wait',
          delay: 10000,
          message: 'Network congested. Waiting for better conditions.'
        };

      case ErrorType.NONCE_ERROR:
        return {
          action: 'retry',
          message: 'Nonce conflict detected. Refreshing nonce and retrying.'
        };

      case ErrorType.TIMEOUT_ERROR:
        return {
          action: 'retry',
          delay: 2000,
          message: 'Transaction timeout. Retrying with higher gas price.'
        };

      case ErrorType.INSUFFICIENT_FUNDS:
        return {
          action: 'cancel',
          message: 'Insufficient funds. Transaction cannot be completed.'
        };

      case ErrorType.CONTRACT_ERROR:
        return {
          action: 'manual_intervention',
          message: 'Smart contract execution failed. Manual review required.'
        };

      case ErrorType.SIGNATURE_ERROR:
        return {
          action: 'cancel',
          message: 'Invalid signature. Transaction cannot be processed.'
        };

      default:
        return {
          action: 'manual_intervention',
          message: 'Unknown error. Manual intervention required.'
        };
    }
  }

  /**
   * Get error statistics and patterns
   * Requirements: 7.5
   */
  public getErrorStatistics(timeWindow?: number): {
    totalErrors: number;
    errorsByType: Record<ErrorType, number>;
    retryableErrors: number;
    averageRetryCount: number;
    mostCommonErrors: { type: ErrorType; count: number }[];
    recentErrors: BlockchainError[];
  } {
    const cutoffTime = timeWindow 
      ? new Date(Date.now() - timeWindow)
      : new Date(0);

    const relevantErrors = this.errorLog.filter(
      error => error.timestamp >= cutoffTime
    );

    const errorsByType = relevantErrors.reduce((acc, error) => {
      acc[error.type] = (acc[error.type] || 0) + 1;
      return acc;
    }, {} as Record<ErrorType, number>);

    const retryableErrors = relevantErrors.filter(error => error.retryable).length;
    const errorsWithRetryCount = relevantErrors.filter(error => error.retryCount !== undefined);
    const averageRetryCount = errorsWithRetryCount.length > 0
      ? errorsWithRetryCount.reduce((sum, error) => sum + (error.retryCount || 0), 0) / errorsWithRetryCount.length
      : 0;

    const mostCommonErrors = Object.entries(errorsByType)
      .map(([type, count]) => ({ type: type as ErrorType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalErrors: relevantErrors.length,
      errorsByType,
      retryableErrors,
      averageRetryCount,
      mostCommonErrors,
      recentErrors: relevantErrors.slice(-10)
    };
  }

  /**
   * Clear old error logs to prevent memory issues
   */
  public clearOldLogs(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoffTime = new Date(Date.now() - maxAge);
    this.errorLog = this.errorLog.filter(error => error.timestamp >= cutoffTime);
  }

  // Private helper methods for error classification

  private isNetworkError(error: Error): boolean {
    const networkKeywords = [
      'network error',
      'connection refused',
      'econnrefused',
      'enotfound',
      'enetunreach',
      'socket hang up'
    ];
    const message = error.message.toLowerCase();
    
    // Check for network keywords but exclude transaction-specific timeouts
    return networkKeywords.some(keyword => message.includes(keyword)) ||
           (message.includes('timeout') && !message.includes('transaction timeout'));
  }

  private isGasError(error: Error): boolean {
    const gasKeywords = [
      'gas required exceeds allowance',
      'insufficient gas',
      'gas limit exceeded',
      'gas price too low',
      'underpriced',
      'replacement transaction underpriced'
    ];
    return gasKeywords.some(keyword => 
      error.message.toLowerCase().includes(keyword)
    );
  }

  private isInsufficientFundsError(error: Error): boolean {
    const fundsKeywords = [
      'insufficient funds',
      'insufficient balance',
      'not enough ether',
      'sender doesn\'t have enough funds'
    ];
    return fundsKeywords.some(keyword => 
      error.message.toLowerCase().includes(keyword)
    );
  }

  private isNonceError(error: Error): boolean {
    const nonceKeywords = [
      'nonce too low',
      'nonce too high',
      'invalid nonce',
      'nonce has already been used'
    ];
    return nonceKeywords.some(keyword => 
      error.message.toLowerCase().includes(keyword)
    );
  }

  private isTimeoutError(error: Error): boolean {
    const timeoutKeywords = [
      'transaction timeout',
      'timed out',
      'request timeout'
    ];
    // Check for timeout keywords but exclude network-related timeouts that should be classified as network errors
    return timeoutKeywords.some(keyword => 
      error.message.toLowerCase().includes(keyword)
    ) && !this.isNetworkError(error);
  }

  private isContractError(error: Error): boolean {
    const contractKeywords = [
      'execution reverted',
      'contract execution failed',
      'invalid opcode',
      'out of gas',
      'stack underflow',
      'stack overflow'
    ];
    return contractKeywords.some(keyword => 
      error.message.toLowerCase().includes(keyword)
    );
  }

  private isSignatureError(error: Error): boolean {
    const signatureKeywords = [
      'invalid signature',
      'signature verification failed',
      'bad signature',
      'signature mismatch'
    ];
    return signatureKeywords.some(keyword => 
      error.message.toLowerCase().includes(keyword)
    );
  }

  private isCongestionError(error: Error): boolean {
    const congestionKeywords = [
      'network congested',
      'too many pending transactions',
      'mempool full',
      'transaction pool limit'
    ];
    return congestionKeywords.some(keyword => 
      error.message.toLowerCase().includes(keyword)
    );
  }

  private logError(error: BlockchainError): void {
    this.errorLog.push(error);
    
    // Maintain log size limit
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }

    // Log to console for immediate visibility
    console.error(`[${error.type}] ${error.message}`, {
      timestamp: error.timestamp,
      retryable: error.retryable,
      context: error.context
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Transaction Recovery Manager
 * Handles failed transaction recovery and queuing
 * Requirements: 7.4, 7.5
 */
export class TransactionRecoveryManager {
  private pendingRecoveries: Map<string, {
    transaction: any;
    error: BlockchainError;
    attempts: number;
    lastAttempt: Date;
    strategy: ReturnType<BlockchainErrorHandler['createRecoveryStrategy']>;
  }> = new Map();

  private errorHandler: BlockchainErrorHandler;
  private maxRecoveryAttempts: number = 5;

  constructor(errorHandler: BlockchainErrorHandler) {
    this.errorHandler = errorHandler;
  }

  /**
   * Add failed transaction for recovery
   */
  public addFailedTransaction(
    transactionId: string,
    transaction: any,
    error: BlockchainError
  ): void {
    const strategy = this.errorHandler.createRecoveryStrategy(error);
    
    this.pendingRecoveries.set(transactionId, {
      transaction,
      error,
      attempts: 0,
      lastAttempt: new Date(),
      strategy
    });
  }

  /**
   * Process pending recoveries
   */
  public async processPendingRecoveries(
    executeTransaction: (tx: any) => Promise<any>
  ): Promise<{
    recovered: string[];
    failed: string[];
    stillPending: string[];
  }> {
    const recovered: string[] = [];
    const failed: string[] = [];
    const stillPending: string[] = [];

    for (const [txId, recovery] of this.pendingRecoveries.entries()) {
      try {
        // Check if enough time has passed for retry
        if (recovery.strategy.delay) {
          const timeSinceLastAttempt = Date.now() - recovery.lastAttempt.getTime();
          if (timeSinceLastAttempt < recovery.strategy.delay) {
            stillPending.push(txId);
            continue;
          }
        }

        // Check if we've exceeded max attempts
        if (recovery.attempts >= this.maxRecoveryAttempts) {
          failed.push(txId);
          this.pendingRecoveries.delete(txId);
          continue;
        }

        // Apply recovery strategy
        let modifiedTransaction = { ...recovery.transaction };
        
        if (recovery.strategy.action === 'adjust_gas' && recovery.strategy.gasAdjustment) {
          if (modifiedTransaction.gasPrice) {
            modifiedTransaction.gasPrice = BigInt(
              Math.floor(Number(modifiedTransaction.gasPrice) * recovery.strategy.gasAdjustment)
            );
          }
        }

        // Attempt recovery
        await executeTransaction(modifiedTransaction);
        recovered.push(txId);
        this.pendingRecoveries.delete(txId);

      } catch (error) {
        recovery.attempts++;
        recovery.lastAttempt = new Date();
        recovery.error = this.errorHandler.parseError(error, {
          recoveryAttempt: recovery.attempts,
          originalError: recovery.error.type
        });

        if (recovery.attempts >= this.maxRecoveryAttempts) {
          failed.push(txId);
          this.pendingRecoveries.delete(txId);
        } else {
          stillPending.push(txId);
        }
      }
    }

    return { recovered, failed, stillPending };
  }

  /**
   * Get recovery status
   */
  public getRecoveryStatus(): {
    totalPending: number;
    byStrategy: Record<string, number>;
    oldestPending: Date | null;
  } {
    const byStrategy: Record<string, number> = {};
    let oldestPending: Date | null = null;

    for (const recovery of this.pendingRecoveries.values()) {
      byStrategy[recovery.strategy.action] = (byStrategy[recovery.strategy.action] || 0) + 1;
      
      if (!oldestPending || recovery.lastAttempt < oldestPending) {
        oldestPending = recovery.lastAttempt;
      }
    }

    return {
      totalPending: this.pendingRecoveries.size,
      byStrategy,
      oldestPending
    };
  }

  /**
   * Clear old pending recoveries
   */
  public clearOldRecoveries(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoffTime = new Date(Date.now() - maxAge);
    
    for (const [txId, recovery] of this.pendingRecoveries.entries()) {
      if (recovery.lastAttempt < cutoffTime) {
        this.pendingRecoveries.delete(txId);
      }
    }
  }
}