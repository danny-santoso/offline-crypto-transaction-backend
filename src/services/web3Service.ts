import { Web3 } from 'web3';
import dotenv from 'dotenv';

dotenv.config();

export class Web3Service {
  private web3: Web3;
  private networkUrl: string;

  constructor() {
    this.networkUrl = this.getNetworkUrl();
    this.web3 = new Web3(this.networkUrl);
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
}