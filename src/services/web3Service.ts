import { Web3 } from 'web3';
import dotenv from 'dotenv';
import { BlockchainErrorHandler, TransactionRecoveryManager, ErrorType } from './errorHandler';

dotenv.config();

export class Web3Service {
  private web3: Web3;
  private networkUrl: string;
  private errorHandler: BlockchainErrorHandler;
  private recoveryManager: TransactionRecoveryManager;

  constructor() {
    this.networkUrl = this.getNetworkUrl();
    this.web3 = new Web3(this.networkUrl);
    this.errorHandler = new BlockchainErrorHandler();
    this.recoveryManager = new TransactionRecoveryManager(this.errorHandler);
  }

  private getNetworkUrl(): string {
    const network = process.env.ETHEREUM_NETWORK || 'localhost';
    
    switch (network) {
      case 'sepolia':
        return process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY';
      case 'goerli':
        return process.env.GOERLI_RPC_URL || 'https://goerli.infura.io/v3/YOUR_INFURA_KEY';
      case 'localhost':
      default:
        return process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545';
    }
  }

  /**
   * Get Web3 instance
   */
  public getWeb3(): Web3 {
    return this.web3;
  }

  /**
   * Check if connected to Ethereum network
   */
  public async isConnected(): Promise<boolean> {
    try {
      await this.web3.eth.getBlockNumber();
      return true;
    } catch (error) {
      console.error('Web3 connection error:', error);
      return false;
    }
  }

  /**
   * Get current network ID
   */
  public async getNetworkId(): Promise<bigint> {
    return await this.web3.eth.getChainId();
  }

  /**
   * Get current block number
   */
  public async getCurrentBlock(): Promise<bigint> {
    return await this.web3.eth.getBlockNumber();
  }

  /**
   * Get account balance in Wei
   */
  public async getBalance(address: string): Promise<bigint> {
    return await this.web3.eth.getBalance(address);
  }

  /**
   * Get account balance in Ether
   */
  public async getBalanceInEther(address: string): Promise<string> {
    const balanceWei = await this.getBalance(address);
    return this.web3.utils.fromWei(balanceWei, 'ether');
  }

  /**
   * Convert Wei to Ether
   */
  public weiToEther(wei: bigint | string): string {
    return this.web3.utils.fromWei(wei, 'ether');
  }

  /**
   * Convert Ether to Wei
   */
  public etherToWei(ether: string): bigint {
    return BigInt(this.web3.utils.toWei(ether, 'ether'));
  }

  /**
   * Get gas price
   */
  public async getGasPrice(): Promise<bigint> {
    return await this.web3.eth.getGasPrice();
  }

  /**
   * Estimate gas for a transaction
   */
  public async estimateGas(transaction: any): Promise<bigint> {
    return await this.web3.eth.estimateGas(transaction);
  }

  /**
   * Get transaction receipt
   */
  public async getTransactionReceipt(txHash: string) {
    return await this.web3.eth.getTransactionReceipt(txHash);
  }

  /**
   * Wait for transaction confirmation
   */
  public async waitForTransaction(txHash: string, confirmations: number = 1): Promise<any> {
    let receipt = null;
    let confirmedBlocks = 0;

    while (confirmedBlocks < confirmations) {
      receipt = await this.getTransactionReceipt(txHash);
      
      if (receipt && receipt.blockNumber) {
        const currentBlock = await this.getCurrentBlock();
        confirmedBlocks = Number(currentBlock - receipt.blockNumber) + 1;
        
        if (confirmedBlocks < confirmations) {
          // Wait 2 seconds before checking again
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } else {
        // Wait 2 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return receipt;
  }

  /**
   * Send a transaction with enhanced error handling and retry logic
   * Requirements: 7.2, 7.3, 7.4, 7.5, 9.2, 9.5
   */
  public async sendTransaction(transaction: any, retries: number = 3): Promise<any> {
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return await this.errorHandler.executeWithRetry(
      async () => {
        // Estimate gas if not provided
        if (!transaction.gas) {
          transaction.gas = await this.estimateGas(transaction);
        }

        // Get optimal gas price based on network conditions
        if (!transaction.gasPrice) {
          const congestion = await this.getNetworkCongestion();
          transaction.gasPrice = await this.getOptimalGasPrice(
            congestion.level === 'high' ? 'fast' : 'standard'
          );
        }

        // Send the transaction
        const txHash = await this.web3.eth.sendTransaction(transaction);
        return txHash;
      },
      { 
        transactionId,
        method: 'sendTransaction',
        to: transaction.to,
        value: transaction.value 
      },
      { maxRetries: retries }
    );
  }

  /**
   * Monitor transaction status with timeout
   * Requirements: 7.2, 7.3, 9.2, 9.5
   */
  public async monitorTransaction(
    txHash: string, 
    timeoutMs: number = 300000, // 5 minutes default
    confirmations: number = 1
  ): Promise<{
    receipt: any;
    status: 'success' | 'failed' | 'timeout';
    confirmations: number;
    gasUsed?: bigint;
  }> {
    const startTime = Date.now();
    
    try {
      const receipt = await Promise.race([
        this.waitForTransaction(txHash, confirmations),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), timeoutMs)
        )
      ]);

      const currentBlock = await this.getCurrentBlock();
      const actualConfirmations = receipt.blockNumber 
        ? Number(currentBlock - receipt.blockNumber) + 1 
        : 0;

      return {
        receipt,
        status: receipt.status ? 'success' : 'failed',
        confirmations: actualConfirmations,
        gasUsed: receipt.gasUsed
      };

    } catch (error) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        return {
          receipt: null,
          status: 'timeout',
          confirmations: 0
        };
      }
      throw error;
    }
  }

  /**
   * Get optimal gas price based on network conditions
   * Requirements: 7.4, 7.5
   */
  public async getOptimalGasPrice(priority: 'slow' | 'standard' | 'fast' = 'standard'): Promise<bigint> {
    try {
      const baseGasPrice = await this.getGasPrice();
      
      switch (priority) {
        case 'slow':
          return (baseGasPrice * BigInt(90)) / BigInt(100); // 10% below base
        case 'fast':
          return (baseGasPrice * BigInt(150)) / BigInt(100); // 50% above base
        case 'standard':
        default:
          return (baseGasPrice * BigInt(110)) / BigInt(100); // 10% above base
      }
    } catch (error) {
      console.error('Error getting optimal gas price:', error);
      // Fallback to a reasonable default (20 gwei)
      return BigInt('20000000000');
    }
  }

  /**
   * Batch multiple transactions for cost efficiency
   * Requirements: 7.4, 7.5
   */
  public async batchTransactions(transactions: any[]): Promise<{
    successful: string[];
    failed: { transaction: any; error: string }[];
    totalGasUsed: bigint;
  }> {
    const successful: string[] = [];
    const failed: { transaction: any; error: string }[] = [];
    let totalGasUsed = BigInt(0);

    // Get optimal gas price for all transactions
    const gasPrice = await this.getOptimalGasPrice('standard');

    for (const transaction of transactions) {
      try {
        transaction.gasPrice = gasPrice;
        const txHash = await this.sendTransaction(transaction, 1); // Single retry for batch to avoid timeout
        successful.push(txHash);

        // Monitor transaction and accumulate gas usage
        const result = await this.monitorTransaction(txHash, 30000, 1); // 30 second timeout
        if (result.gasUsed) {
          totalGasUsed += result.gasUsed;
        }

      } catch (error) {
        failed.push({
          transaction,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      successful,
      failed,
      totalGasUsed
    };
  }

  /**
   * Check network congestion level
   * Requirements: 7.5
   */
  public async getNetworkCongestion(): Promise<{
    level: 'low' | 'medium' | 'high';
    gasPrice: bigint;
    pendingTransactions: number;
    blockUtilization: number;
  }> {
    try {
      const [gasPrice, latestBlock, pendingTxCount] = await Promise.all([
        this.getGasPrice(),
        this.web3.eth.getBlock('latest', true),
        this.web3.eth.getPendingTransactions()
      ]);

      const blockUtilization = latestBlock.gasUsed && latestBlock.gasLimit
        ? Number(latestBlock.gasUsed) / Number(latestBlock.gasLimit)
        : 0;

      const pendingTransactions = Array.isArray(pendingTxCount) ? pendingTxCount.length : 0;

      // Determine congestion level based on gas price and block utilization
      let level: 'low' | 'medium' | 'high' = 'low';
      const gasPriceGwei = Number(gasPrice) / 1e9;

      if (gasPriceGwei > 50 || blockUtilization > 0.9) {
        level = 'high';
      } else if (gasPriceGwei > 20 || blockUtilization > 0.7) {
        level = 'medium';
      }

      return {
        level,
        gasPrice,
        pendingTransactions,
        blockUtilization
      };

    } catch (error) {
      console.error('Error checking network congestion:', error);
      return {
        level: 'medium',
        gasPrice: BigInt('20000000000'), // 20 gwei fallback
        pendingTransactions: 0,
        blockUtilization: 0.5
      };
    }
  }

  /**
   * Create a contract instance for interaction
   * Requirements: 7.2, 7.3, 9.2
   */
  public createContract(abi: any[], address: string) {
    return new this.web3.eth.Contract(abi, address);
  }

  /**
   * Call a contract method (read-only)
   * Requirements: 7.2, 7.3, 9.2
   */
  public async callContractMethod(
    contract: any,
    methodName: string,
    params: any[] = [],
    options: any = {}
  ): Promise<any> {
    try {
      return await contract.methods[methodName](...params).call(options);
    } catch (error) {
      console.error(`Error calling contract method ${methodName}:`, error);
      throw error;
    }
  }

  /**
   * Send a transaction to a contract method
   * Requirements: 7.2, 7.3, 9.2, 9.5
   */
  public async sendContractTransaction(
    contract: any,
    methodName: string,
    params: any[] = [],
    options: any = {},
    retries: number = 3
  ): Promise<any> {
    try {
      // Estimate gas if not provided
      if (!options.gas) {
        options.gas = await contract.methods[methodName](...params).estimateGas(options);
      }

      // Get optimal gas price if not provided
      if (!options.gasPrice) {
        options.gasPrice = await this.getOptimalGasPrice('standard');
      }

      // Send transaction with retry logic
      return await this.sendTransactionWithRetry(
        () => contract.methods[methodName](...params).send(options),
        retries
      );

    } catch (error) {
      console.error(`Error sending contract transaction ${methodName}:`, error);
      throw error;
    }
  }

  /**
   * Helper method for transaction retry logic with enhanced error handling
   * Requirements: 7.4, 7.5
   */
  private async sendTransactionWithRetry(
    transactionFn: () => Promise<any>,
    retries: number
  ): Promise<any> {
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return await this.errorHandler.executeWithRetry(
      transactionFn,
      { 
        transactionId,
        method: 'sendTransactionWithRetry'
      },
      { maxRetries: retries }
    );
  }

  /**
   * Get error handler instance for external access
   * Requirements: 7.4, 7.5
   */
  public getErrorHandler(): BlockchainErrorHandler {
    return this.errorHandler;
  }

  /**
   * Get recovery manager instance for external access
   * Requirements: 7.4, 7.5
   */
  public getRecoveryManager(): TransactionRecoveryManager {
    return this.recoveryManager;
  }

  /**
   * Process pending transaction recoveries
   * Requirements: 7.4, 7.5
   */
  public async processPendingRecoveries(): Promise<{
    recovered: string[];
    failed: string[];
    stillPending: string[];
  }> {
    return await this.recoveryManager.processPendingRecoveries(
      async (transaction) => {
        return await this.sendTransaction(transaction, 1);
      }
    );
  }

  /**
   * Add failed transaction for recovery
   * Requirements: 7.4, 7.5
   */
  public addFailedTransactionForRecovery(
    transactionId: string,
    transaction: any,
    error: Error
  ): void {
    const blockchainError = this.errorHandler.parseError(error, {
      transactionId,
      transaction: {
        to: transaction.to,
        value: transaction.value,
        gasPrice: transaction.gasPrice
      }
    });

    this.recoveryManager.addFailedTransaction(transactionId, transaction, blockchainError);
  }

  /**
   * Get comprehensive error statistics
   * Requirements: 7.5
   */
  public getErrorStatistics(timeWindow?: number) {
    return this.errorHandler.getErrorStatistics(timeWindow);
  }

  /**
   * Get recovery status
   * Requirements: 7.4, 7.5
   */
  public getRecoveryStatus() {
    return this.recoveryManager.getRecoveryStatus();
  }

  /**
   * Enhanced transaction monitoring with recovery
   * Requirements: 7.4, 7.5, 9.5
   */
  public async monitorTransactionWithRecovery(
    txHash: string,
    originalTransaction: any,
    timeoutMs: number = 300000,
    confirmations: number = 1
  ): Promise<{
    receipt: any;
    status: 'success' | 'failed' | 'timeout' | 'recovered';
    confirmations: number;
    gasUsed?: bigint;
    recoveryAttempts?: number;
  }> {
    try {
      const result = await this.monitorTransaction(txHash, timeoutMs, confirmations);
      
      if (result.status === 'success') {
        return { ...result, recoveryAttempts: 0 };
      }

      // If transaction failed or timed out, add to recovery queue
      if (result.status === 'failed' || result.status === 'timeout') {
        const transactionId = `recovery_${txHash}`;
        const error = new Error(`Transaction ${result.status}: ${txHash}`);
        
        this.addFailedTransactionForRecovery(transactionId, originalTransaction, error);
        
        return {
          ...result,
          status: result.status,
          recoveryAttempts: 0
        };
      }

      return result;

    } catch (error) {
      // Add to recovery queue on any monitoring error
      const transactionId = `monitor_error_${txHash}`;
      this.addFailedTransactionForRecovery(transactionId, originalTransaction, error as Error);
      
      throw error;
    }
  }

  /**
   * Cleanup old error logs and recovery attempts
   * Requirements: 7.5
   */
  public cleanup(maxAge: number = 24 * 60 * 60 * 1000): void {
    this.errorHandler.clearOldLogs(maxAge);
    this.recoveryManager.clearOldRecoveries(maxAge);
  }

  /**
   * Health check with error handling metrics
   * Requirements: 7.2, 7.5, 9.2, 9.5
   */
  public async healthCheckWithMetrics(): Promise<{
    isConnected: boolean;
    networkId: bigint | null;
    blockNumber: bigint | null;
    gasPrice: bigint | null;
    congestionLevel: 'low' | 'medium' | 'high';
    errorStats: ReturnType<BlockchainErrorHandler['getErrorStatistics']>;
    recoveryStatus: ReturnType<TransactionRecoveryManager['getRecoveryStatus']>;
    error?: string;
  }> {
    try {
      const [isConnected, networkId, blockNumber, gasPrice, congestion] = await Promise.all([
        this.isConnected(),
        this.getNetworkId().catch(() => null),
        this.getCurrentBlock().catch(() => null),
        this.getGasPrice().catch(() => null),
        this.getNetworkCongestion()
      ]);

      const errorStats = this.getErrorStatistics(60 * 60 * 1000); // Last hour
      const recoveryStatus = this.getRecoveryStatus();

      return {
        isConnected,
        networkId,
        blockNumber,
        gasPrice,
        congestionLevel: congestion.level,
        errorStats,
        recoveryStatus
      };

    } catch (error) {
      const errorStats = this.getErrorStatistics(60 * 60 * 1000);
      const recoveryStatus = this.getRecoveryStatus();

      return {
        isConnected: false,
        networkId: null,
        blockNumber: null,
        gasPrice: null,
        congestionLevel: 'medium',
        errorStats,
        recoveryStatus,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}