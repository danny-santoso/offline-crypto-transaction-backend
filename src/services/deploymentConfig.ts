import fs from 'fs';
import path from 'path';
import { monitoringService } from './monitoring';

export interface DeploymentConfig {
  contractAddress?: string;
  network: string;
  chainId: number;
  rpcUrl: string;
  gasPrice?: string;
  gasLimit?: number;
  confirmations: number;
  otmAddresses: string[];
}

export interface DeploymentInfo {
  contractAddress: string;
  network: string;
  chainId: string;
  deploymentTime: string;
  blockNumber: number;
  gasUsed?: number;
  transactionHash?: string;
}

export class DeploymentConfigService {
  private configPath: string;
  private deploymentsPath: string;

  constructor() {
    this.configPath = path.join(__dirname, '../../config');
    this.deploymentsPath = path.join(__dirname, '../../blockchain/deployments');
    this.ensureDirectories();
  }

  private ensureDirectories() {
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true });
    }
    if (!fs.existsSync(this.deploymentsPath)) {
      fs.mkdirSync(this.deploymentsPath, { recursive: true });
    }
  }

  public getNetworkConfig(network: string): DeploymentConfig {
    const configs: Record<string, DeploymentConfig> = {
      localhost: {
        network: 'localhost',
        chainId: 1337,
        rpcUrl: 'http://127.0.0.1:8545',
        confirmations: 1,
        otmAddresses: []
      },
      sepolia: {
        network: 'sepolia',
        chainId: 11155111,
        rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY',
        gasPrice: '20000000000', // 20 gwei
        gasLimit: 3000000,
        confirmations: 5,
        otmAddresses: []
      },
      goerli: {
        network: 'goerli',
        chainId: 5,
        rpcUrl: process.env.GOERLI_RPC_URL || 'https://goerli.infura.io/v3/YOUR_INFURA_KEY',
        gasPrice: '20000000000', // 20 gwei
        gasLimit: 3000000,
        confirmations: 5,
        otmAddresses: []
      }
    };

    const config = configs[network];
    if (!config) {
      throw new Error(`Unsupported network: ${network}`);
    }

    return config;
  }

  public saveDeploymentInfo(deploymentInfo: DeploymentInfo): void {
    try {
      const filePath = path.join(this.deploymentsPath, `${deploymentInfo.network}-deployment.json`);
      fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
      
      monitoringService.recordDeployment(
        deploymentInfo.contractAddress,
        deploymentInfo.network,
        deploymentInfo.gasUsed
      );
      
      console.log(`Deployment info saved to: ${filePath}`);
    } catch (error) {
      monitoringService.recordError(error as Error, 'saveDeploymentInfo');
      throw error;
    }
  }

  public loadDeploymentInfo(network: string): DeploymentInfo | null {
    try {
      const filePath = path.join(this.deploymentsPath, `${network}-deployment.json`);
      
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      monitoringService.recordError(error as Error, 'loadDeploymentInfo');
      return null;
    }
  }

  public updateEnvironmentFile(contractAddress: string): void {
    try {
      const envPath = path.join(__dirname, '../../.env');
      
      if (!fs.existsSync(envPath)) {
        // Create .env file from example
        const examplePath = path.join(__dirname, '../../.env.example');
        if (fs.existsSync(examplePath)) {
          fs.copyFileSync(examplePath, envPath);
        }
      }

      let envContent = fs.readFileSync(envPath, 'utf8');
      
      // Update or add the contract address
      const addressLine = `OFFLINE_TOKEN_CONTRACT_ADDRESS=${contractAddress}`;
      if (envContent.includes('OFFLINE_TOKEN_CONTRACT_ADDRESS=')) {
        envContent = envContent.replace(/OFFLINE_TOKEN_CONTRACT_ADDRESS=.*/, addressLine);
      } else {
        envContent += `\n${addressLine}\n`;
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log('Updated .env file with contract address');
    } catch (error) {
      monitoringService.recordError(error as Error, 'updateEnvironmentFile');
      throw error;
    }
  }

  public validateDeployment(network: string): boolean {
    const deploymentInfo = this.loadDeploymentInfo(network);
    
    if (!deploymentInfo) {
      console.error(`No deployment found for network: ${network}`);
      return false;
    }

    if (!deploymentInfo.contractAddress) {
      console.error('Contract address not found in deployment info');
      return false;
    }

    console.log(`✓ Deployment validated for ${network}`);
    console.log(`  Contract Address: ${deploymentInfo.contractAddress}`);
    console.log(`  Chain ID: ${deploymentInfo.chainId}`);
    console.log(`  Deployed at: ${deploymentInfo.deploymentTime}`);
    
    return true;
  }

  public getDeploymentStatus(): Record<string, boolean> {
    const networks = ['localhost', 'sepolia', 'goerli'];
    const status: Record<string, boolean> = {};

    networks.forEach(network => {
      status[network] = this.validateDeployment(network);
    });

    return status;
  }

  public generateDeploymentReport(): string {
    const status = this.getDeploymentStatus();
    const stats = monitoringService.getStats();
    
    let report = '# Deployment Report\n\n';
    report += `Generated at: ${new Date().toISOString()}\n\n`;
    
    report += '## Network Status\n\n';
    Object.entries(status).forEach(([network, deployed]) => {
      const icon = deployed ? '✅' : '❌';
      report += `- ${icon} ${network}: ${deployed ? 'Deployed' : 'Not deployed'}\n`;
    });
    
    report += '\n## Monitoring Stats\n\n';
    report += `- Total Events: ${stats.totalEvents}\n`;
    report += `- Recent Events (1h): ${stats.recentEvents}\n`;
    report += `- Errors: ${stats.errors}\n`;
    report += `- Warnings: ${stats.warnings}\n`;
    
    report += '\n## Events by Type\n\n';
    Object.entries(stats.eventsByType).forEach(([type, count]) => {
      report += `- ${type}: ${count}\n`;
    });

    return report;
  }
}

// Singleton instance
export const deploymentConfigService = new DeploymentConfigService();