import request from 'supertest';
import app from '../index';
import { deploymentConfigService } from '../services/deploymentConfig';
import { monitoringService } from '../services/monitoring';

describe('Deployment Routes', () => {
  beforeEach(() => {
    // Clear monitoring events before each test
    monitoringService.clearEvents();
  });

  describe('GET /api/deployment/status', () => {
    test('should return deployment status for all networks', async () => {
      const response = await request(app)
        .get('/api/deployment/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('networks');
      expect(response.body.data).toHaveProperty('monitoring');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data.networks).toHaveProperty('localhost');
      expect(response.body.data.networks).toHaveProperty('sepolia');
      expect(response.body.data.networks).toHaveProperty('goerli');
    });
  });

  describe('GET /api/deployment/info/:network', () => {
    test('should return 404 for non-existent deployment', async () => {
      const response = await request(app)
        .get('/api/deployment/info/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Deployment not found');
    });

    test('should return deployment info when deployment exists', async () => {
      // First create a test deployment
      const deploymentInfo = {
        contractAddress: '0x1234567890123456789012345678901234567890',
        network: 'testinfo',
        chainId: '1337',
        deploymentTime: new Date().toISOString(),
        blockNumber: 12345
      };

      deploymentConfigService.saveDeploymentInfo(deploymentInfo);

      const response = await request(app)
        .get('/api/deployment/info/testinfo')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.contractAddress).toBe(deploymentInfo.contractAddress);
      expect(response.body.data.network).toBe(deploymentInfo.network);
    });
  });

  describe('GET /api/deployment/config/:network', () => {
    test('should return network configuration for localhost', async () => {
      const response = await request(app)
        .get('/api/deployment/config/localhost')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.network).toBe('localhost');
      expect(response.body.data.chainId).toBe(1337);
      expect(response.body.data.rpcUrl).toBe('http://127.0.0.1:8545');
    });

    test('should return network configuration for sepolia with redacted RPC URL', async () => {
      const response = await request(app)
        .get('/api/deployment/config/sepolia')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.network).toBe('sepolia');
      expect(response.body.data.chainId).toBe(11155111);
      expect(response.body.data.rpcUrl).toBe('[REDACTED]');
    });

    test('should return error for unsupported network', async () => {
      const response = await request(app)
        .get('/api/deployment/config/unsupported')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get network config');
    });
  });

  describe('GET /api/deployment/report', () => {
    test('should return deployment report in markdown format', async () => {
      const response = await request(app)
        .get('/api/deployment/report')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/markdown; charset=utf-8');
      expect(response.text).toContain('# Deployment Report');
      expect(response.text).toContain('## Network Status');
      expect(response.text).toContain('## Monitoring Stats');
    });
  });

  describe('GET /api/deployment/events', () => {
    test('should return monitoring events', async () => {
      // Add some test events
      monitoringService.recordDeployment('0x123', 'localhost');
      monitoringService.recordTransaction('0xabc', 'purchase', 21000, true);

      const response = await request(app)
        .get('/api/deployment/events')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('events');
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data.events.length).toBeGreaterThan(0);
    });

    test('should filter events by type', async () => {
      // Add different types of events
      monitoringService.recordDeployment('0x123', 'localhost');
      monitoringService.recordError(new Error('Test error'));

      const response = await request(app)
        .get('/api/deployment/events?type=deployment')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.events.every((event: any) => event.type === 'deployment')).toBe(true);
    });

    test('should limit number of events returned', async () => {
      // Add multiple events
      for (let i = 0; i < 5; i++) {
        monitoringService.recordDeployment(`0x${i}`, 'localhost');
      }

      const response = await request(app)
        .get('/api/deployment/events?limit=3')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.events.length).toBeLessThanOrEqual(3);
    });
  });

  describe('POST /api/deployment/validate/:network', () => {
    test('should validate existing deployment', async () => {
      // First create a test deployment
      const deploymentInfo = {
        contractAddress: '0x1234567890123456789012345678901234567890',
        network: 'testvalidate',
        chainId: '1337',
        deploymentTime: new Date().toISOString(),
        blockNumber: 12345
      };

      deploymentConfigService.saveDeploymentInfo(deploymentInfo);

      const response = await request(app)
        .post('/api/deployment/validate/testvalidate')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.network).toBe('testvalidate');
      expect(response.body.data.isValid).toBe(true);
      expect(response.body.data).toHaveProperty('timestamp');
    });

    test('should return false for non-existent deployment', async () => {
      const response = await request(app)
        .post('/api/deployment/validate/nonexistent')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.network).toBe('nonexistent');
      expect(response.body.data.isValid).toBe(false);
    });
  });

  describe('Error handling', () => {
    test('should handle internal server errors gracefully', async () => {
      // Mock a service method to throw an error
      const originalMethod = deploymentConfigService.getDeploymentStatus;
      deploymentConfigService.getDeploymentStatus = jest.fn(() => {
        throw new Error('Test error');
      });

      const response = await request(app)
        .get('/api/deployment/status')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get deployment status');

      // Restore original method
      deploymentConfigService.getDeploymentStatus = originalMethod;
    });
  });
});