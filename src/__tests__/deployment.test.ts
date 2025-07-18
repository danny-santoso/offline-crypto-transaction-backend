import { deploymentConfigService } from '../services/deploymentConfig';
import { monitoringService } from '../services/monitoring';
import fs from 'fs';
import path from 'path';

describe('Deployment Configuration Tests', () => {
  beforeEach(() => {
    // Clear monitoring events before each test
    monitoringService.clearEvents();
  });

  describe('DeploymentConfigService', () => {
    test('should get network configuration for localhost', () => {
      const config = deploymentConfigService.getNetworkConfig('localhost');
      
      expect(config.network).toBe('localhost');
      expect(config.chainId).toBe(1337);
      expect(config.rpcUrl).toBe('http://127.0.0.1:8545');
      expect(config.confirmations).toBe(1);
    });

    test('should get network configuration for sepolia', () => {
      const config = deploymentConfigService.getNetworkConfig('sepolia');
      
      expect(config.network).toBe('sepolia');
      expect(config.chainId).toBe(11155111);
      expect(config.confirmations).toBe(5);
      expect(config.gasPrice).toBe('20000000000');
    });

    test('should throw error for unsupported network', () => {
      expect(() => {
        deploymentConfigService.getNetworkConfig('unsupported');
      }).toThrow('Unsupported network: unsupported');
    });

    test('should save and load deployment info', () => {
      const deploymentInfo = {
        contractAddress: '0x1234567890123456789012345678901234567890',
        network: 'test',
        chainId: '1337',
        deploymentTime: new Date().toISOString(),
        blockNumber: 12345,
        gasUsed: 2000000,
        transactionHash: '0xabcdef'
      };

      deploymentConfigService.saveDeploymentInfo(deploymentInfo);
      const loaded = deploymentConfigService.loadDeploymentInfo('test');

      expect(loaded).toEqual(deploymentInfo);
    });

    test('should return null for non-existent deployment', () => {
      const loaded = deploymentConfigService.loadDeploymentInfo('nonexistent');
      expect(loaded).toBeNull();
    });

    test('should validate deployment correctly', () => {
      // First save a deployment
      const deploymentInfo = {
        contractAddress: '0x1234567890123456789012345678901234567890',
        network: 'testvalidation',
        chainId: '1337',
        deploymentTime: new Date().toISOString(),
        blockNumber: 12345
      };

      deploymentConfigService.saveDeploymentInfo(deploymentInfo);
      
      // Then validate it
      const isValid = deploymentConfigService.validateDeployment('testvalidation');
      expect(isValid).toBe(true);
    });

    test('should fail validation for non-existent deployment', () => {
      const isValid = deploymentConfigService.validateDeployment('nonexistent');
      expect(isValid).toBe(false);
    });

    test('should generate deployment report', () => {
      const report = deploymentConfigService.generateDeploymentReport();
      
      expect(report).toContain('# Deployment Report');
      expect(report).toContain('## Network Status');
      expect(report).toContain('## Monitoring Stats');
      expect(report).toContain('Generated at:');
    });
  });

  describe('MonitoringService', () => {
    test('should record deployment event', () => {
      monitoringService.recordDeployment('0x123', 'localhost', 2000000);
      
      const events = monitoringService.getEvents('deployment');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('deployment');
      expect(events[0].data.contractAddress).toBe('0x123');
      expect(events[0].data.network).toBe('localhost');
    });

    test('should record transaction event', () => {
      monitoringService.recordTransaction('0xabc', 'purchase', 21000, true);
      
      const events = monitoringService.getEvents('transaction');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('transaction');
      expect(events[0].data.txHash).toBe('0xabc');
      expect(events[0].data.success).toBe(true);
    });

    test('should record error event', () => {
      const error = new Error('Test error');
      monitoringService.recordError(error, 'test context');
      
      const events = monitoringService.getEvents('error');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].data.error).toBe('Test error');
      expect(events[0].data.context).toBe('test context');
    });

    test('should record performance event', () => {
      monitoringService.recordPerformance('deploy', 3000, true);
      
      const events = monitoringService.getEvents('performance');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('performance');
      expect(events[0].data.operation).toBe('deploy');
      expect(events[0].data.duration).toBe(3000);
    });

    test('should get events since specific time', () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      
      monitoringService.recordDeployment('0x123', 'localhost');
      
      const recentEvents = monitoringService.getEventsSince(oneMinuteAgo);
      expect(recentEvents.length).toBeGreaterThan(0);
    });

    test('should generate stats correctly', () => {
      monitoringService.recordDeployment('0x123', 'localhost');
      monitoringService.recordError(new Error('Test error'));
      monitoringService.recordTransaction('0xabc', 'purchase', 21000, true);
      
      const stats = monitoringService.getStats();
      
      expect(stats.totalEvents).toBeGreaterThan(0);
      expect(stats.eventsByType.deployment).toBe(1);
      expect(stats.eventsByType.error).toBe(1);
      expect(stats.eventsByType.transaction).toBe(1);
    });

    test('should clear events', () => {
      monitoringService.recordDeployment('0x123', 'localhost');
      expect(monitoringService.getEvents().length).toBeGreaterThan(0);
      
      monitoringService.clearEvents();
      expect(monitoringService.getEvents().length).toBe(0);
    });
  });

  // Cleanup after tests
  afterAll(() => {
    // Clean up test deployment files
    const testFiles = [
      'test-deployment.json',
      'testvalidation-deployment.json'
    ];
    
    testFiles.forEach(file => {
      const filePath = path.join(__dirname, '../../blockchain/deployments', file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  });
});