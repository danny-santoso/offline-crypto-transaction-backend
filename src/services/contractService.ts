import { Web3Service } from './web3Service';
import { Contract } from 'web3';

export interface ContractConfig {
  address: string;
  abi: any[];
}

export class ContractService {
  private web3Service: Web3Service;
  private contracts: Map<string, Contract<any>> = new Map();

  constructor(web3Service: Web3Service) {
    this.web3Service = web3Service;
  }

  /**
   * Register a smart contract
   */
  public registerContract(name: string, config: ContractConfig): void {
    const web3 = this.web3Service.getWeb3();
    const contract = new web3.eth.Contract(config.abi, config.address);
    this.contracts.set(name, contract);
  }

  /**
   * Get a registered contract
   */
  public getContract(name: string): Contract<any> | undefined {
    return this.contracts.get(name);
  }

  /**
   * Call a contract method (read-only)
   */
  public async callMethod(
    contractName: string,
    methodName: string,
    params: any[] = [],
    options: any = {}
  ): Promise<any> {
    const contract = this.getContract(contractName);
    if (!contract) {
      throw new Error(`Contract ${contractName} not found`);
    }

    try {
      const result = await contract.methods[methodName](...params).call(options);
      return result;
    } catch (error) {
      console.error(`Error calling ${contractName}.${methodName}:`, error);
      throw error;
    }
  }

  /**
   * Send a transaction to a contract method
   */
  public async sendTransaction(
    contractName: string,
    methodName: string,
    params: any[] = [],
    options: any = {}
  ): Promise<any> {
    const contract = this.getContract(contractName);
    if (!contract) {
      throw new Error(`Contract ${contractName} not found`);
    }

    try {
      // Estimate gas if not provided
      if (!options.gas) {
        const gasEstimate = await contract.methods[methodName](...params).estimateGas(options);
        options.gas = gasEstimate;
      }

      // Get gas price if not provided
      if (!options.gasPrice) {
        options.gasPrice = await this.web3Service.getGasPrice();
      }

      const transaction = await contract.methods[methodName](...params).send(options);
      return transaction;
    } catch (error) {
      console.error(`Error sending transaction to ${contractName}.${methodName}:`, error);
      throw error;
    }
  }

  /**
   * Get contract events
   */
  public async getEvents(
    contractName: string,
    eventName: string,
    options: any = {}
  ): Promise<any[]> {
    const contract = this.getContract(contractName);
    if (!contract) {
      throw new Error(`Contract ${contractName} not found`);
    }

    try {
      const events = await contract.getPastEvents(eventName, options);
      return events;
    } catch (error) {
      console.error(`Error getting events from ${contractName}.${eventName}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to contract events
   */
  public subscribeToEvents(
    contractName: string,
    eventName: string,
    callback: (error: Error | null, event: any) => void,
    options: any = {}
  ): any {
    const contract = this.getContract(contractName);
    if (!contract) {
      throw new Error(`Contract ${contractName} not found`);
    }

    const subscription = contract.events[eventName](options);
    
    subscription.on('data', (event: any) => callback(null, event));
    subscription.on('error', (error: Error) => callback(error, null));

    return subscription;
  }

  /**
   * Get all registered contract names
   */
  public getRegisteredContracts(): string[] {
    return Array.from(this.contracts.keys());
  }

  /**
   * Remove a registered contract
   */
  public unregisterContract(name: string): boolean {
    return this.contracts.delete(name);
  }
}