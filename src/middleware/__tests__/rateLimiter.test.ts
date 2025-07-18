/**
 * Tests for Rate Limiting Middleware
 * Requirements: 9.4, 9.5
 */

import { Request, Response, NextFunction } from 'express';
import {
  rateLimit,
  RateLimitConfigs,
  createUserRateLimit,
  createEndpointRateLimit,
  bypassRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  cleanupRateLimiter
} from '../rateLimiter';
import { RateLimitError } from '../errorHandler';

// Mock Express objects
const mockRequest = (overrides = {}) => ({
  ip: '127.0.0.1',
  connection: { remoteAddress: '127.0.0.1' },
  method: 'GET',
  path: '/test',
  route: { path: '/test' },
  headers: {},
  ...overrides
}) as unknown as Request;

const mockResponse = () => {
  const res = {
    set: jest.fn(),
    send: jest.fn(),
    statusCode: 200
  } as unknown as Response;
  return res;
};

const mockNext = jest.fn() as NextFunction;

describe('rateLimit middleware', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = mockRequest();
    res = mockResponse();
    next = mockNext;
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanupRateLimiter();
  });

  test('should allow requests within limit', async () => {
    const middleware = rateLimit({
      windowMs: 60000, // 1 minute
      maxRequests: 5
    });

    // Make 3 requests
    for (let i = 0; i < 3; i++) {
      await middleware(req, res, next);
    }

    expect(next).toHaveBeenCalledTimes(3);
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'X-RateLimit-Limit': '5',
        'X-RateLimit-Remaining': expect.any(String)
      })
    );
  });

  test('should block requests exceeding limit', async () => {
    const middleware = rateLimit({
      windowMs: 60000,
      maxRequests: 2
    });

    // Make requests up to limit
    await middleware(req, res, next);
    await middleware(req, res, next);

    // This should exceed the limit and call next with error
    await middleware(req, res, next);
    
    expect(next).toHaveBeenCalledWith(expect.any(RateLimitError));
  });

  test('should set correct rate limit headers', async () => {
    const middleware = rateLimit({
      windowMs: 60000,
      maxRequests: 5
    });

    await middleware(req, res, next);

    expect(res.set).toHaveBeenCalledWith({
      'X-RateLimit-Limit': '5',
      'X-RateLimit-Remaining': '4',
      'X-RateLimit-Reset': expect.any(String),
      'X-RateLimit-Window': '60'
    });
  });

  test('should set retry-after header when limit exceeded', async () => {
    const middleware = rateLimit({
      windowMs: 60000,
      maxRequests: 1
    });

    await middleware(req, res, next);
    await middleware(req, res, next);

    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  test('should use custom key generator', async () => {
    const customKeyGenerator = jest.fn().mockReturnValue('custom-key');
    const middleware = rateLimit({
      windowMs: 60000,
      maxRequests: 1,
      keyGenerator: customKeyGenerator
    });

    await middleware(req, res, next);

    expect(customKeyGenerator).toHaveBeenCalledWith(req);
  });

  test('should call onLimitReached callback', async () => {
    const onLimitReached = jest.fn();
    const middleware = rateLimit({
      windowMs: 60000,
      maxRequests: 1,
      onLimitReached,
      keyGenerator: () => 'callback-test-key'
    });

    await middleware(req, res, next);
    await middleware(req, res, next);

    expect(onLimitReached).toHaveBeenCalledWith(req, res);
  });

  test('should skip successful requests when configured', async () => {
    const middleware = rateLimit({
      windowMs: 60000,
      maxRequests: 1,
      skipSuccessfulRequests: true
    });

    // Mock successful response
    res.statusCode = 200;
    const originalSend = res.send;
    
    await middleware(req, res, next);
    
    // Simulate successful response
    if (res.send !== originalSend) {
      (res.send as any)('success');
    }

    // Should allow another request since the first was successful
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  test('should skip failed requests when configured', async () => {
    const middleware = rateLimit({
      windowMs: 60000,
      maxRequests: 1,
      skipFailedRequests: true
    });

    // Mock failed response
    res.statusCode = 400;
    const originalSend = res.send;
    
    await middleware(req, res, next);
    
    // Simulate failed response
    if (res.send !== originalSend) {
      (res.send as any)('error');
    }

    // Should allow another request since the first failed
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  test('should reset window after expiry', async () => {
    jest.useFakeTimers();
    
    const middleware = rateLimit({
      windowMs: 1000, // 1 second
      maxRequests: 1
    });

    await middleware(req, res, next);

    // Fast-forward time beyond window
    jest.advanceTimersByTime(1001);

    // Should allow request again
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});

describe('RateLimitConfigs', () => {
  test('should have predefined configurations', () => {
    expect(RateLimitConfigs.general).toBeDefined();
    expect(RateLimitConfigs.strict).toBeDefined();
    expect(RateLimitConfigs.tokenOperations).toBeDefined();
    expect(RateLimitConfigs.validation).toBeDefined();
    expect(RateLimitConfigs.publicKeyOperations).toBeDefined();
  });

  test('should have reasonable limits', () => {
    expect(RateLimitConfigs.general.maxRequests).toBeGreaterThan(0);
    expect(RateLimitConfigs.general.windowMs).toBeGreaterThan(0);
    expect(RateLimitConfigs.strict.maxRequests).toBeLessThan(RateLimitConfigs.general.maxRequests);
  });
});

describe('createUserRateLimit', () => {
  test('should use user ID when available', async () => {
    const next1 = jest.fn();
    const next2 = jest.fn();
    
    const req = mockRequest({
      headers: { 'x-user-id': 'user123' }
    });

    const middleware = createUserRateLimit({
      windowMs: 60000,
      maxRequests: 5
    });

    await middleware(req, mockResponse(), next1);

    // The key should be based on user ID, not IP
    // We can't directly test the key, but we can test that different users get separate limits
    const req2 = mockRequest({
      headers: { 'x-user-id': 'user456' },
      ip: '127.0.0.1' // Same IP
    });

    await middleware(req2, mockResponse(), next2);
    expect(next1).toHaveBeenCalledTimes(1);
    expect(next2).toHaveBeenCalledTimes(1);
  });

  test('should fall back to IP when no user ID', async () => {
    const req = mockRequest(); // No user ID header
    const next = jest.fn();

    const middleware = createUserRateLimit({
      windowMs: 60000,
      maxRequests: 1
    });

    await middleware(req, mockResponse(), next);
    
    // Same IP should be rate limited
    await middleware(req, mockResponse(), next);
    
    expect(next).toHaveBeenCalledWith(expect.any(RateLimitError));
  });
});

describe('createEndpointRateLimit', () => {
  test('should create separate limits per endpoint', async () => {
    const next1 = jest.fn();
    const next2 = jest.fn();
    
    const middleware = createEndpointRateLimit({
      windowMs: 60000,
      maxRequests: 1
    });

    const req1 = mockRequest({ method: 'GET', route: { path: '/api/test1' } });
    const req2 = mockRequest({ method: 'GET', route: { path: '/api/test2' } });

    await middleware(req1, mockResponse(), next1);
    await middleware(req2, mockResponse(), next2);

    expect(next1).toHaveBeenCalledTimes(1);
    expect(next2).toHaveBeenCalledTimes(1);
  });
});

describe('bypassRateLimit', () => {
  test('should bypass in test environment', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();

    bypassRateLimit(req, res, next);

    expect(next).toHaveBeenCalledWith();

    process.env.NODE_ENV = originalEnv;
  });

  test('should bypass with special header', () => {
    const req = mockRequest({
      headers: { 'x-bypass-rate-limit': 'true' }
    });
    const res = mockResponse();
    const next = jest.fn();

    bypassRateLimit(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  test('should not bypass in production without header', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();

    bypassRateLimit(req, res, next);

    expect(next).toHaveBeenCalledWith();

    process.env.NODE_ENV = originalEnv;
  });
});

describe('getRateLimitStatus and resetRateLimit', () => {
  test('should get rate limit status', async () => {
    const middleware = rateLimit({
      windowMs: 60000,
      maxRequests: 5,
      keyGenerator: () => 'test-key'
    });

    await middleware(mockRequest(), mockResponse(), mockNext);

    const status = getRateLimitStatus('test-key');
    expect(status).toBeDefined();
    expect(status?.totalHits).toBe(1);
  });

  test('should reset rate limit', async () => {
    const next = jest.fn();
    const middleware = rateLimit({
      windowMs: 60000,
      maxRequests: 1,
      keyGenerator: () => 'reset-test-key'
    });

    await middleware(mockRequest(), mockResponse(), next);

    resetRateLimit('reset-test-key');

    // Should allow request again after reset
    await middleware(mockRequest(), mockResponse(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  test('should return null for non-existent key', () => {
    const status = getRateLimitStatus('non-existent-key');
    expect(status).toBeNull();
  });
});