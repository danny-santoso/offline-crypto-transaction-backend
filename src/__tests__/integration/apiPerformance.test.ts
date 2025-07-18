import request from 'supertest';
import app from '../../index';
import { monitoringService } from '../../services/monitoring';

describe('API Performance Integration Tests', () => {
  beforeEach(() => {
    monitoringService.clearEvents();
  });

  describe('Load Testing', () => {
    test('should handle high concurrent load on health endpoint', async () => {
      const concurrentRequests = 50;
      const startTime = Date.now();

      const requests = Array(concurrentRequests).fill(null).map(() =>
        request(app)
          .get('/health')
          .expect(200)
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.body.status).toBe('OK');
      });

      // Should complete within reasonable time (10 seconds for 50 requests)
      expect(duration).toBeLessThan(10000);

      // Average response time should be reasonable
      const avgResponseTime = duration / concurrentRequests;
      expect(avgResponseTime).toBeLessThan(200); // 200ms average

      monitoringService.recordPerformance('health-endpoint-load', duration, true);
    });

    test('should handle concurrent deployment status requests', async () => {
      const concurrentRequests = 20;
      const startTime = Date.now();

      const requests = Array(concurrentRequests).fill(null).map(() =>
        request(app)
          .get('/api/deployment/status')
          .expect(200)
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('networks');
        expect(response.body.data).toHaveProperty('monitoring');
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(15000);

      monitoringService.recordPerformance('deployment-status-load', duration, true);
    });

    test('should handle mixed API endpoint load', async () => {
      const endpoints = [
        '/health',
        '/api',
        '/api/deployment/status',
        '/api/deployment/config/localhost',
        '/api/deployment/events',
        '/api/public-keys'
      ];

      const requestsPerEndpoint = 10;
      const startTime = Date.now();

      const allRequests = endpoints.flatMap(endpoint =>
        Array(requestsPerEndpoint).fill(null).map(() =>
          request(app).get(endpoint)
        )
      );

      const responses = await Promise.all(allRequests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Count successful responses
      const successfulResponses = responses.filter(response => 
        response.status >= 200 && response.status < 300
      );

      // At least 90% should succeed
      const successRate = successfulResponses.length / responses.length;
      expect(successRate).toBeGreaterThanOrEqual(0.9);

      // Should complete within reasonable time
      expect(duration).toBeLessThan(20000);

      monitoringService.recordPerformance('mixed-endpoint-load', duration, successRate >= 0.9);
    });
  });

  describe('Rate Limiting Tests', () => {
    test('should enforce rate limits correctly', async () => {
      // Make requests beyond the rate limit (100 requests per 15 minutes)
      const requests = Array(105).fill(null).map(() =>
        request(app)
          .get('/health')
      );

      const responses = await Promise.all(requests);

      // Some requests should be rate limited (429 status)
      const rateLimitedResponses = responses.filter(response => response.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // Rate limited responses should have appropriate message
      rateLimitedResponses.forEach(response => {
        expect(response.text).toContain('Too many requests');
      });
    });

    test('should allow requests after rate limit window', async () => {
      // This test would need to wait for the rate limit window to reset
      // For now, we'll just verify the rate limit headers are present
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory during sustained load', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform sustained operations
      for (let i = 0; i < 10; i++) {
        const requests = Array(20).fill(null).map(() =>
          request(app)
            .get('/api/deployment/status')
            .expect(200)
        );
        
        await Promise.all(requests);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      
      // Memory usage shouldn't increase dramatically (allow 50MB increase)
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB
    });

    test('should handle large response payloads efficiently', async () => {
      const startTime = Date.now();
      
      // Request deployment report which might be large
      const response = await request(app)
        .get('/api/deployment/report')
        .expect(200);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should respond quickly even for large payloads
      expect(duration).toBeLessThan(5000);
      expect(response.text.length).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery Tests', () => {
    test('should recover gracefully from service errors', async () => {
      // Mock a service error by making invalid requests
      const invalidRequests = [
        request(app).get('/api/deployment/info/nonexistent'),
        request(app).get('/api/deployment/config/invalid'),
        request(app).post('/api/validate-signature').send({}),
      ];

      const responses = await Promise.all(invalidRequests);

      // All should return proper error responses, not crash
      responses.forEach(response => {
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.body).toHaveProperty('success', false);
      });

      // Server should still be responsive after errors
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      expect(healthResponse.body.status).toBe('OK');
    });

    test('should maintain service availability during errors', async () => {
      // Mix of valid and invalid requests
      const mixedRequests = [
        request(app).get('/health'),
        request(app).get('/api/deployment/info/nonexistent'),
        request(app).get('/api'),
        request(app).get('/api/deployment/config/invalid'),
        request(app).get('/api/deployment/status'),
      ];

      const responses = await Promise.all(mixedRequests);

      // Valid requests should succeed
      expect(responses[0].status).toBe(200); // health
      expect(responses[2].status).toBe(200); // api
      expect(responses[4].status).toBe(200); // deployment status

      // Invalid requests should fail gracefully
      expect(responses[1].status).toBe(404); // nonexistent deployment
      expect(responses[3].status).toBe(500); // invalid config
    });
  });

  describe('Monitoring Integration', () => {
    test('should record performance metrics during load', async () => {
      // Clear existing events
      monitoringService.clearEvents();

      // Perform operations that should generate monitoring events
      await request(app).get('/health').expect(200);
      await request(app).get('/api/deployment/status').expect(200);
      
      // Try to trigger an error for monitoring
      await request(app).get('/api/deployment/info/nonexistent').expect(404);

      // Check that monitoring events were recorded
      const events = monitoringService.getEvents();
      expect(events.length).toBeGreaterThan(0);

      // Check monitoring stats
      const stats = monitoringService.getStats();
      expect(stats.totalEvents).toBeGreaterThan(0);
    });

    test('should provide accurate performance statistics', async () => {
      monitoringService.clearEvents();

      // Record some test performance metrics
      monitoringService.recordPerformance('test-operation-1', 100, true);
      monitoringService.recordPerformance('test-operation-2', 200, true);
      monitoringService.recordPerformance('test-operation-3', 5000, false); // Slow operation

      const stats = monitoringService.getStats();
      expect(stats.eventsByType.performance).toBe(3);

      const performanceEvents = monitoringService.getEvents('performance');
      expect(performanceEvents).toHaveLength(3);

      // Check that slow operation was marked as warning
      const slowEvent = performanceEvents.find(e => e.data.duration === 5000);
      expect(slowEvent?.severity).toBe('warning');
    });
  });

  afterAll(() => {
    // Generate final performance report
    const stats = monitoringService.getStats();
    console.log('Performance Test Summary:', {
      totalEvents: stats.totalEvents,
      eventsByType: stats.eventsByType,
      errors: stats.errors,
      warnings: stats.warnings
    });
  });
});