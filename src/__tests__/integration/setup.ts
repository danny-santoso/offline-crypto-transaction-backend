import { deploymentConfigService } from '../../services/deploymentConfig';
import { monitoringService } from '../../services/monitoring';

// Global test setup for integration tests
beforeAll(async () => {
  console.log('🔧 Setting up integration test environment...');
  
  // Verify deployment exists
  const deploymentInfo = deploymentConfigService.loadDeploymentInfo('localhost');
  if (!deploymentInfo) {
    console.warn('⚠️  No localhost deployment found. Some tests may fail.');
    console.log('Run "npm run deploy:local" to deploy contracts before running integration tests.');
  } else {
    console.log(`✅ Found deployment at ${deploymentInfo.contractAddress}`);
  }

  // Clear monitoring events
  monitoringService.clearEvents();
});

afterAll(async () => {
  console.log('🧹 Cleaning up integration test environment...');
  
  // Generate test summary
  const stats = monitoringService.getStats();
  console.log('Integration Test Summary:', {
    totalEvents: stats.totalEvents,
    errors: stats.errors,
    warnings: stats.warnings
  });
});

// Increase timeout for integration tests
jest.setTimeout(60000);