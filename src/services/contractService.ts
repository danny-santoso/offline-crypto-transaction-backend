import { Web3Service } from './web3Service';
import { Contract } from 'web3';

/**
 * Smart Contract Integration Service
 * Provides specific methods for interacting with the OfflineTokenManager contract
 * Requirements: 7.2, 7.3, 9.2, 9.5
 */
export class ContractService {
  private web3Service: Web3Service;
  private contract: Contract<any> | null = null;
  private contractAddress: string | null = null;

  constructor(web3Service: Web3Service) {
    this.web3Service = web3Service;
  }

  /**
   * Initialize the contract with ABI and address
   * Requirements: 7.2, 7.3, 9.2
   */
  public initializeContract(abi: any[], address: string): void {
    this.contractAddress = address;
    this.contract = this.web3Service.createContract(abi, address);
  }

  /**
   * Get the contract instance
   */
  public getContract(): Contract<any> | null {
    return this.contract;
  }

  /**
   * Get contract address
   */
  public getContractAddress(): string | null {
    return this.contractAddress;
  }

  /**
   * Purchase offline tokens
   * Requirements: 1.1, 1.5, 4.1, 7.2, 7.3, 9.2
   */
  public async purchaseOfflineTokens(
    userAddress: string,
    amount: string,
    privateKey?: string
  ): Promise<{
    transactionHash: string;
    receipt: any;
    gasUsed: bigint;
  }> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const amountWei = this.web3Service.etherToWei(amount);
      
      const options = {
        from: userAddress,
        value: amountWei.toString(),
        gas: undefined as any,
        gasPrice: undefined as any
      };

      // Estimate gas
      options.gas = await this.contract.methods
        .purchaseOfflineTokens(amountWei.toString())
        .estimateGas(options);

      // Get optimal gas price
      options.gasPrice = await this.web3Service.getOptimalGasPrice('standard');

      // Send transaction
      const txHash = await this.web3Service.sendContractTransaction(
        this.contract,
        'purchaseOfflineTokens',
        [amountWei.toString()],
        options,
        3 // retries
      );

      // Monitor transaction
      const result = await this.web3Service.monitorTransaction(txHash, 300000, 2);
      
      if (result.status !== 'success') {
        throw new Error(`Transaction failed with status: ${result.status}`);
      }

      return {
        transactionHash: txHash,
        receipt: result.receipt,
        gasUsed: result.gasUsed || BigInt(0)
      };

    } catch (error) {
      console.error('Error purchasing offline tokens:', error);
      throw error;
    }
  }

  /**
   * Redeem offline tokens
   * Requirements: 1.5, 4.2, 7.2, 7.3, 9.2
   */
  public async redeemOfflineTokens(
    userAddress: string,
    amount: string,
    privateKey?: string
  ): Promise<{
    transactionHash: string;
    receipt: any;
    gasUsed: bigint;
  }> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const amountWei = this.web3Service.etherToWei(amount);
      
      const options = {
        from: userAddress,
        gas: undefined as any,
        gasPrice: undefined as any
      };

      // Estimate gas
      options.gas = await this.contract.methods
        .redeemOfflineTokens(amountWei.toString())
        .estimateGas(options);

      // Get optimal gas price
      options.gasPrice = await this.web3Service.getOptimalGasPrice('standard');

      // Send transaction
      const txHash = await this.web3Service.sendContractTransaction(
        this.contract,
        'redeemOfflineTokens',
        [amountWei.toString()],
        options,
        3 // retries
      );

      // Monitor transaction
      const result = await this.web3Service.monitorTransaction(txHash, 300000, 2);
      
      if (result.status !== 'success') {
        throw new Error(`Transaction failed with status: ${result.status}`);
      }

      return {
        transactionHash: txHash,
        receipt: result.receipt,
        gasUsed: result.gasUsed || BigInt(0)
      };

    } catch (error) {
      console.error('Error redeeming offline tokens:', error);
      throw error;
    }
  }

  /**
   * Validate token signature
   * Requirements: 5.1, 5.4, 5.5, 7.2, 7.3, 9.2
   */
  public async validateTokenSignature(
    signature: string,
    amount: string,
    tokenId: string,
    issuer: string,
    nonce: number,
    fromAddress: string
  ): Promise<{
    isValid: boolean;
    transactionHash?: string;
    gasUsed?: bigint;
  }> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const amountWei = this.web3Service.etherToWei(amount);
      const tokenIdBytes = this.web3Service.getWeb3().utils.keccak256(tokenId);

      // First, try to call the method to check validity without sending transaction
      const isValid = await this.web3Service.callContractMethod(
        this.contract,
        'validateTokenSignature',
        [signature, amountWei.toString(), tokenIdBytes, issuer, nonce],
        { from: fromAddress }
      );

      // If validation is successful and we need to record it on-chain
      if (isValid) {
        const options = {
          from: fromAddress,
          gas: undefined as any,
          gasPrice: undefined as any
        };

        // Estimate gas
        options.gas = await this.contract.methods
          .validateTokenSignature(signature, amountWei.toString(), tokenIdBytes, issuer, nonce)
          .estimateGas(options);

        // Get optimal gas price
        options.gasPrice = await this.web3Service.getOptimalGasPrice('standard');

        // Send transaction to record validation
        const txHash = await this.web3Service.sendContractTransaction(
          this.contract,
          'validateTokenSignature',
          [signature, amountWei.toString(), tokenIdBytes, issuer, nonce],
          options,
          2 // retries
        );

        // Monitor transaction
        const result = await this.web3Service.monitorTransaction(txHash, 180000, 1);

        return {
          isValid: true,
          transactionHash: txHash,
          gasUsed: result.gasUsed || BigInt(0)
        };
      }

      return { isValid: false };

    } catch (error) {
      console.error('Error validating token signature:', error);
      return { isValid: false };
    }
  }

  /**
   * Get user balance
   * Requirements: 1.1, 9.1, 9.2
   */
  public async getUserBalance(userAddress: string): Promise<{
    balance: string;
    offlineCredits: string;
    balanceWei: bigint;
    offlineCreditsWei: bigint;
  }> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const [balanceWei, offlineCreditsWei] = await Promise.all([
        this.web3Service.callContractMethod(
          this.contract,
          'getBalance',
          [userAddress]
        ),
        this.web3Service.callContractMethod(
          this.contract,
          'getOfflineTokenCredits',
          [userAddress]
        )
      ]);

      return {
        balance: this.web3Service.weiToEther(balanceWei),
        offlineCredits: this.web3Service.weiToEther(offlineCreditsWei),
        balanceWei: BigInt(balanceWei),
        offlineCreditsWei: BigInt(offlineCreditsWei)
      };

    } catch (error) {
      console.error('Error getting user balance:', error);
      throw error;
    }
  }

  /**
   * Get user transaction history
   * Requirements: 5.2, 5.6, 7.5, 9.2
   */
  public async getUserTransactionHistory(
    userAddress: string,
    offset: number = 0,
    limit: number = 50
  ): Promise<{
    transactions: any[];
    totalCount: number;
  }> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const [transactions, totalCount] = await Promise.all([
        this.web3Service.callContractMethod(
          this.contract,
          'getUserTransactionHistoryPaginated',
          [userAddress, offset, Math.min(limit, 100)]
        ),
        this.web3Service.callContractMethod(
          this.contract,
          'getUserTransactionCount',
          [userAddress]
        )
      ]);

      return {
        transactions: transactions.map((tx: any) => ({
          transactionId: tx.transactionId,
          user: tx.user,
          transactionType: tx.transactionType,
          amount: this.web3Service.weiToEther(tx.amount),
          amountWei: BigInt(tx.amount),
          timestamp: Number(tx.timestamp),
          nonce: Number(tx.nonce),
          blockHash: tx.blockHash
        })),
        totalCount: Number(totalCount)
      };

    } catch (error) {
      console.error('Error getting user transaction history:', error);
      throw error;
    }
  }

  /**
   * Get authorized OTMs
   * Requirements: 5.4, 5.5, 9.3
   */
  public async getAuthorizedOTMs(): Promise<{
    otmAddresses: string[];
    totalCount: number;
  }> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const [otmAddresses, totalCount] = await Promise.all([
        this.web3Service.callContractMethod(
          this.contract,
          'getAuthorizedOTMs',
          []
        ),
        this.web3Service.callContractMethod(
          this.contract,
          'getAuthorizedOTMCount',
          []
        )
      ]);

      return {
        otmAddresses,
        totalCount: Number(totalCount)
      };

    } catch (error) {
      console.error('Error getting authorized OTMs:', error);
      throw error;
    }
  }

  /**
   * Check if address is authorized OTM
   * Requirements: 5.4, 5.5, 9.3
   */
  public async isAuthorizedOTM(address: string): Promise<boolean> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      return await this.web3Service.callContractMethod(
        this.contract,
        'isAuthorizedOTM',
        [address]
      );

    } catch (error) {
      console.error('Error checking OTM authorization:', error);
      return false;
    }
  }

  /**
   * Get contract statistics
   * Requirements: 7.5, 9.2
   */
  public async getContractStats(): Promise<{
    totalSupply: string;
    totalOfflineCredits: string;
    contractBalance: string;
    totalSupplyWei: bigint;
    totalOfflineCreditsWei: bigint;
    contractBalanceWei: bigint;
  }> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const [totalSupplyWei, totalOfflineCreditsWei, contractBalanceWei] = await Promise.all([
        this.web3Service.callContractMethod(
          this.contract,
          'getTotalSupply',
          []
        ),
        this.web3Service.callContractMethod(
          this.contract,
          'getTotalOfflineCredits',
          []
        ),
        this.web3Service.callContractMethod(
          this.contract,
          'getContractBalance',
          []
        )
      ]);

      return {
        totalSupply: this.web3Service.weiToEther(totalSupplyWei),
        totalOfflineCredits: this.web3Service.weiToEther(totalOfflineCreditsWei),
        contractBalance: this.web3Service.weiToEther(contractBalanceWei),
        totalSupplyWei: BigInt(totalSupplyWei),
        totalOfflineCreditsWei: BigInt(totalOfflineCreditsWei),
        contractBalanceWei: BigInt(contractBalanceWei)
      };

    } catch (error) {
      console.error('Error getting contract stats:', error);
      throw error;
    }
  }

  /**
   * Get user nonce
   * Requirements: 5.2, 5.6
   */
  public async getUserNonce(userAddress: string): Promise<number> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const nonce = await this.web3Service.callContractMethod(
        this.contract,
        'getUserNonce',
        [userAddress]
      );

      return Number(nonce);

    } catch (error) {
      console.error('Error getting user nonce:', error);
      throw error;
    }
  }

  /**
   * Validate transaction nonce
   * Requirements: 5.2, 5.6
   */
  public async validateTransactionNonce(
    userAddress: string,
    expectedNonce: number
  ): Promise<boolean> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      return await this.web3Service.callContractMethod(
        this.contract,
        'validateTransactionNonce',
        [userAddress, expectedNonce]
      );

    } catch (error) {
      console.error('Error validating transaction nonce:', error);
      return false;
    }
  }

  /**
   * Check if signature has been used
   * Requirements: 5.2, 5.6
   */
  public async isSignatureUsed(signatureHash: string): Promise<boolean> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      return await this.web3Service.callContractMethod(
        this.contract,
        'isSignatureUsed',
        [signatureHash]
      );

    } catch (error) {
      console.error('Error checking signature usage:', error);
      return false;
    }
  }

  /**
   * Batch multiple contract operations for efficiency
   * Requirements: 7.4, 7.5
   */
  public async batchContractOperations(operations: {
    method: string;
    params: any[];
    options: any;
  }[]): Promise<{
    successful: string[];
    failed: { operation: any; error: string }[];
    totalGasUsed: bigint;
  }> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    const successful: string[] = [];
    const failed: { operation: any; error: string }[] = [];
    let totalGasUsed = BigInt(0);

    // Get optimal gas price for all operations
    const gasPrice = await this.web3Service.getOptimalGasPrice('standard');

    for (const operation of operations) {
      try {
        operation.options.gasPrice = gasPrice;

        // Estimate gas if not provided
        if (!operation.options.gas) {
          operation.options.gas = await this.contract.methods[operation.method](...operation.params)
            .estimateGas(operation.options);
        }

        const txHash = await this.web3Service.sendContractTransaction(
          this.contract,
          operation.method,
          operation.params,
          operation.options,
          2 // Reduced retries for batch
        );

        successful.push(txHash);

        // Monitor transaction and accumulate gas usage
        const result = await this.web3Service.monitorTransaction(txHash, 60000, 1);
        if (result.gasUsed) {
          totalGasUsed += result.gasUsed;
        }

      } catch (error) {
        failed.push({
          operation,
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
   * Monitor contract events
   * Requirements: 7.5, 9.2, 9.5
   */
  public async getContractEvents(
    eventName: string,
    fromBlock: number = 0,
    toBlock: number | 'latest' = 'latest',
    filter: any = {}
  ): Promise<any[]> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const events = await this.contract.getPastEvents(eventName, {
        fromBlock,
        toBlock,
        filter
      });

      return events.map(event => {
        // Handle both string and EventLog types
        if (typeof event === 'string') {
          return {
            event: 'Unknown',
            blockNumber: 0,
            transactionHash: event,
            returnValues: {},
            timestamp: 0
          };
        }
        
        return {
          event: event.event || 'Unknown',
          blockNumber: Number(event.blockNumber) || 0,
          transactionHash: event.transactionHash || '',
          returnValues: event.returnValues || {},
          timestamp: Number(event.blockNumber) || 0 // Will need to fetch actual timestamp if needed
        };
      });

    } catch (error) {
      console.error(`Error getting contract events for ${eventName}:`, error);
      throw error;
    }
  }

  /**
   * Get transaction receipt with enhanced error handling
   * Requirements: 7.4, 7.5, 9.5
   */
  public async getTransactionReceiptWithRetry(
    txHash: string,
    maxRetries: number = 5
  ): Promise<any> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const receipt = await this.web3Service.getTransactionReceipt(txHash);
        if (receipt) {
          return receipt;
        }
        
        // If no receipt yet, wait before retry
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`Receipt fetch attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw new Error(`Failed to get transaction receipt after ${maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Health check for contract connectivity
   * Requirements: 7.2, 9.2, 9.5
   */
  public async healthCheck(): Promise<{
    isConnected: boolean;
    contractAddress: string | null;
    networkId: bigint | null;
    blockNumber: bigint | null;
    contractBalance: string | null;
    error?: string;
  }> {
    try {
      const isConnected = await this.web3Service.isConnected();
      
      if (!isConnected) {
        return {
          isConnected: false,
          contractAddress: this.contractAddress,
          networkId: null,
          blockNumber: null,
          contractBalance: null,
          error: 'Web3 connection failed'
        };
      }

      const [networkId, blockNumber] = await Promise.all([
        this.web3Service.getNetworkId(),
        this.web3Service.getCurrentBlock()
      ]);

      let contractBalance: string | null = null;
      if (this.contract && this.contractAddress) {
        try {
          const balanceWei = await this.web3Service.getBalance(this.contractAddress);
          contractBalance = this.web3Service.weiToEther(balanceWei);
        } catch (error) {
          console.warn('Could not fetch contract balance:', error);
        }
      }

      return {
        isConnected: true,
        contractAddress: this.contractAddress,
        networkId,
        blockNumber,
        contractBalance
      };

    } catch (error) {
      return {
        isConnected: false,
        contractAddress: this.contractAddress,
        networkId: null,
        blockNumber: null,
        contractBalance: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}