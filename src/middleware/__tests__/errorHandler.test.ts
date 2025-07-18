/**
 * Tests for API Error Handling Middleware
 * Requirements: 9.4, 9.5
 */

import { Request, Response, NextFunction } from 'express';
import {
  CustomApiError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
  RateLimitError,
  BlockchainApiError,
  globalErrorHandler,
  notFoundHandler,
  asyncHandler,
  requestTimeout,
  ErrorLogger,
  ApiErrorCode
} from '../errorHandler';
import { BlockchainError, ErrorType } from '../../services/errorHandler';

// Mock Express objects
const mockRequest = (overrides = {}) => ({
  method: 'GET',
  path: '/test',
  url: '/test',
  ip: '127.0.0.1',
  get: jest.fn(),
  ...overrides
}) as unknown as Request;

const mockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    headersSent: false,
    on: jest.fn()
  } as unknown as Response;
  return res;
};

const mockNext = jest.fn() as NextFunction;

describe('CustomApiError', () => {
  test('should create error with default values', () => {
    const error = new CustomApiError('Test error');
    
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe(ApiErrorCode.INTERNAL_ERROR);
    expect(error.isOperational).toBe(true);
    expect(error.name).toBe('CustomApiError');
  });

  test('should create error with custom values', () => {
    const error = new CustomApiError(
      'Custom error',
      400,
      ApiErrorCode.VALIDATION_ERROR,
      { field: 'test' },
      false
    );
    
    expect(error.message).toBe('Custom error');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(error.details).toEqual({ field: 'test' });
    expect(error.isOperational).toBe(false);
  });
});

describe('Specific Error Types', () => {
  test('ValidationError should have correct properties', () => {
    const error = new ValidationError('Invalid input', { field: 'email' });
    
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    expect(error.details).toEqual({ field: 'email' });
  });

  test('NotFoundError should have correct properties', () => {
    const error = new NotFoundError('User not found');
    
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe(ApiErrorCode.NOT_FOUND);
    expect(error.message).toBe('User not found');
  });

  test('ConflictError should have correct properties', () => {
    const error = new ConflictError('Resource already exists');
    
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe(ApiErrorCode.CONFLICT);
  });

  test('ServiceUnavailableError should have correct properties', () => {
    const error = new ServiceUnavailableError('Database down');
    
    expect(error.statusCode).toBe(503);
    expect(error.code).toBe(ApiErrorCode.SERVICE_UNAVAILABLE);
  });

  test('RateLimitError should have correct properties', () => {
    const error = new RateLimitError('Too many requests');
    
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe(ApiErrorCode.RATE_LIMIT_EXCEEDED);
  });

  test('BlockchainApiError should map blockchain errors correctly', () => {
    const blockchainError: BlockchainError = {
      type: ErrorType.VALIDATION_ERROR,
      message: 'Invalid signature',
      retryable: false,
      timestamp: new Date()
    };
    
    const error = new BlockchainApiError(blockchainError);
    
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(ApiErrorCode.BLOCKCHAIN_ERROR);
    expect(error.details.type).toBe(ErrorType.VALIDATION_ERROR);
  });
});

describe('ErrorLogger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('should log API errors with request info', () => {
    const error = new ValidationError('Test error');
    const req = mockRequest({ method: 'POST', body: { test: 'data' } });
    
    ErrorLogger.logApiError(error, req);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('API Error:'),
      expect.objectContaining({
        name: 'CustomApiError',
        message: 'Test error',
        statusCode: 400,
        code: ApiErrorCode.VALIDATION_ERROR,
        request: expect.objectContaining({
          method: 'POST',
          body: { test: 'data' }
        })
      })
    );
  });

  test('should log unhandled errors', () => {
    const error = new Error('Unhandled error');
    
    ErrorLogger.logUnhandledError(error);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('UNHANDLED ERROR:'),
      error
    );
  });
});

describe('globalErrorHandler', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = mockRequest();
    res = mockResponse();
    next = mockNext;
    jest.clearAllMocks();
  });

  test('should handle CustomApiError correctly', () => {
    const error = new ValidationError('Invalid input', { field: 'email' });
    
    globalErrorHandler(error, req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: ApiErrorCode.VALIDATION_ERROR,
        message: 'Invalid input',
        details: { field: 'email' }
      })
    );
  });

  test('should handle unknown errors as internal server error', () => {
    const error = new Error('Unknown error');
    
    globalErrorHandler(error, req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: ApiErrorCode.INTERNAL_ERROR,
        message: 'Internal server error'
      })
    );
  });

  test('should not handle if response already sent', () => {
    const error = new ValidationError('Test error');
    (res as any).headersSent = true;
    
    globalErrorHandler(error, req, res, next);
    
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should include stack trace in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    const error = new ValidationError('Test error');
    
    globalErrorHandler(error, req, res, next);
    
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.any(String)
      })
    );
    
    process.env.NODE_ENV = originalEnv;
  });
});

describe('notFoundHandler', () => {
  test('should create NotFoundError for undefined routes', () => {
    const req = mockRequest({ method: 'GET', path: '/nonexistent' });
    const res = mockResponse();
    const next = jest.fn();
    
    notFoundHandler(req, res, next);
    
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: ApiErrorCode.NOT_FOUND,
        message: 'Route GET /nonexistent not found'
      })
    );
  });
});

describe('asyncHandler', () => {
  test('should catch async errors and pass to next', async () => {
    const asyncFn = jest.fn().mockRejectedValue(new Error('Async error'));
    const wrappedFn = asyncHandler(asyncFn);
    
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();
    
    await wrappedFn(req, res, next);
    
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('should handle successful async functions', async () => {
    const asyncFn = jest.fn().mockResolvedValue('success');
    const wrappedFn = asyncHandler(asyncFn);
    
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();
    
    await wrappedFn(req, res, next);
    
    expect(asyncFn).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requestTimeout', () => {
  jest.useFakeTimers();

  afterEach(() => {
    jest.clearAllTimers();
  });

  test('should timeout request after specified time', () => {
    const timeoutMiddleware = requestTimeout(1000);
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();
    
    timeoutMiddleware(req, res, next);
    
    // Fast-forward time
    jest.advanceTimersByTime(1001);
    
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 408,
        code: 'REQUEST_TIMEOUT'
      })
    );
  });

  test('should clear timeout when response finishes', () => {
    const timeoutMiddleware = requestTimeout(1000);
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();
    
    timeoutMiddleware(req, res, next);
    
    // Simulate response finish
    const finishCallback = (res.on as jest.Mock).mock.calls.find(
      call => call[0] === 'finish'
    )[1];
    finishCallback();
    
    // Fast-forward time
    jest.advanceTimersByTime(1001);
    
    expect(next).toHaveBeenCalledTimes(1); // Only the initial call
  });

  test('should not timeout if response already sent', () => {
    const timeoutMiddleware = requestTimeout(1000);
    const req = mockRequest();
    const res = mockResponse();
    const next = jest.fn();
    
    timeoutMiddleware(req, res, next);
    
    // Simulate response already sent
    (res as any).headersSent = true;
    
    // Fast-forward time
    jest.advanceTimersByTime(1001);
    
    expect(next).toHaveBeenCalledTimes(1); // Only the initial call
  });
});