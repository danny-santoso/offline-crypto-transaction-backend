/**
 * Tests for Input Validation Middleware
 * Requirements: 9.4, 9.5
 */

import { Request, Response, NextFunction } from 'express';
import {
  ValidationUtils,
  validate,
  ValidationSchemas,
  sanitizeInput,
  validateContentType,
  validateRequestSize
} from '../validation';
import { ValidationError } from '../errorHandler';

// Mock Express objects
const mockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  method: 'POST',
  get: jest.fn(),
  ...overrides
}) as unknown as Request;

const mockResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis()
}) as unknown as Response;

const mockNext = jest.fn() as NextFunction;

describe('ValidationUtils', () => {
  describe('isEthereumAddress', () => {
    test('should validate correct Ethereum addresses', () => {
      const validAddresses = [
        '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        '0x0000000000000000000000000000000000000000',
        '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
      ];

      validAddresses.forEach(address => {
        expect(ValidationUtils.isEthereumAddress(address)).toBe(true);
      });
    });

    test('should reject invalid Ethereum addresses', () => {
      const invalidAddresses = [
        '742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6', // Missing 0x
        '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b', // Too short
        '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b66', // Too long
        '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', // Invalid characters
        '', // Empty string
        null, // Null
        undefined // Undefined
      ];

      invalidAddresses.forEach(address => {
        expect(ValidationUtils.isEthereumAddress(address as any)).toBe(false);
      });
    });
  });

  describe('isValidAmount', () => {
    test('should validate positive numbers', () => {
      const validAmounts = [1, 0.1, 100, '1', '0.5', '1000'];
      
      validAmounts.forEach(amount => {
        expect(ValidationUtils.isValidAmount(amount)).toBe(true);
      });
    });

    test('should reject invalid amounts', () => {
      const invalidAmounts = [0, -1, -0.1, 'abc', '', null, undefined, NaN, Infinity];
      
      invalidAmounts.forEach(amount => {
        expect(ValidationUtils.isValidAmount(amount)).toBe(false);
      });
    });
  });

  describe('isValidToken', () => {
    test('should validate correct token structure', () => {
      const validToken = {
        tokenId: 'test-id',
        amount: '1000000000000000000',
        issuer: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        issuedAt: '2023-01-01T00:00:00Z',
        expiresAt: '2023-01-02T00:00:00Z',
        signature: 'signature-string',
        nonce: 1
      };

      expect(ValidationUtils.isValidToken(validToken)).toBe(true);
    });

    test('should reject invalid token structures', () => {
      const invalidTokens = [
        null,
        undefined,
        {},
        { tokenId: 'test' }, // Missing fields
        'not-an-object',
        []
      ];

      invalidTokens.forEach(token => {
        expect(ValidationUtils.isValidToken(token)).toBe(false);
      });
    });
  });

  describe('sanitizeString', () => {
    test('should sanitize string input', () => {
      expect(ValidationUtils.sanitizeString('  hello world  ')).toBe('hello world');
      expect(ValidationUtils.sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
      expect(ValidationUtils.sanitizeString('normal text')).toBe('normal text');
    });
  });

  describe('validateTokenArray', () => {
    test('should separate valid and invalid tokens', () => {
      const validToken = {
        tokenId: 'test-id',
        amount: '1000000000000000000',
        issuer: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        issuedAt: '2023-01-01T00:00:00Z',
        expiresAt: '2023-01-02T00:00:00Z',
        signature: 'signature-string',
        nonce: 1
      };

      const invalidToken = { tokenId: 'incomplete' };

      const result = ValidationUtils.validateTokenArray([validToken, invalidToken]);

      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].index).toBe(1);
    });
  });
});

describe('validate middleware', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = mockRequest();
    res = mockResponse();
    next = mockNext;
    jest.clearAllMocks();
  });

  test('should pass validation with valid data', () => {
    req.body = {
      amount: '1.5',
      userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'
    };

    const middleware = validate(ValidationSchemas.purchaseTokens);
    
    expect(() => middleware(req, res, next)).not.toThrow();
    expect(next).toHaveBeenCalledWith();
  });

  test('should throw ValidationError with invalid data', () => {
    req.body = {
      amount: '', // Invalid amount
      userAddress: 'invalid-address' // Invalid Ethereum address
    };

    const middleware = validate(ValidationSchemas.purchaseTokens);
    
    expect(() => middleware(req, res, next)).toThrow(ValidationError);
  });

  test('should validate required fields', () => {
    req.body = {}; // Missing required fields

    const middleware = validate(ValidationSchemas.purchaseTokens);
    
    expect(() => middleware(req, res, next)).toThrow(ValidationError);
  });

  test('should validate field types', () => {
    req.body = {
      amount: 123, // Should be string
      userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
      expiryHours: 'not-a-number' // Should be number
    };

    const middleware = validate(ValidationSchemas.purchaseTokens);
    
    expect(() => middleware(req, res, next)).toThrow(ValidationError);
  });

  test('should validate min/max constraints', () => {
    req.body = {
      amount: '1',
      userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
      expiryHours: 10000 // Exceeds max of 8760
    };

    const middleware = validate(ValidationSchemas.purchaseTokens);
    
    expect(() => middleware(req, res, next)).toThrow(ValidationError);
  });

  test('should validate custom validation functions', () => {
    req.body = {
      amount: '-1', // Negative amount should fail custom validation
      userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'
    };

    const middleware = validate(ValidationSchemas.purchaseTokens);
    
    expect(() => middleware(req, res, next)).toThrow(ValidationError);
  });

  test('should validate params', () => {
    req.params = {
      address: 'invalid-address'
    };

    const middleware = validate(ValidationSchemas.getBalance);
    
    expect(() => middleware(req, res, next)).toThrow(ValidationError);
  });

  test('should validate query parameters', () => {
    req.query = {
      activeOnly: 'invalid-value' // Should be 'true' or 'false'
    };

    const middleware = validate(ValidationSchemas.getPublicKeys);
    
    expect(() => middleware(req, res, next)).toThrow(ValidationError);
  });
});

describe('ValidationSchemas', () => {
  test('should have all required schemas', () => {
    expect(ValidationSchemas.getBalance).toBeDefined();
    expect(ValidationSchemas.purchaseTokens).toBeDefined();
    expect(ValidationSchemas.redeemTokens).toBeDefined();
    expect(ValidationSchemas.validateSignature).toBeDefined();
    expect(ValidationSchemas.addPublicKey).toBeDefined();
    expect(ValidationSchemas.updatePublicKey).toBeDefined();
    expect(ValidationSchemas.deletePublicKey).toBeDefined();
    expect(ValidationSchemas.getPublicKeys).toBeDefined();
  });

  test('should validate redeem tokens schema', () => {
    const validToken = {
      tokenId: 'test-id',
      amount: '1000000000000000000',
      issuer: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
      issuedAt: '2023-01-01T00:00:00Z',
      expiresAt: '2023-01-02T00:00:00Z',
      signature: 'signature-string',
      nonce: 1
    };

    const req = mockRequest({
      body: {
        tokens: [validToken],
        userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'
      }
    });

    const middleware = validate(ValidationSchemas.redeemTokens);
    
    expect(() => middleware(req, mockResponse(), mockNext)).not.toThrow();
  });
});

describe('sanitizeInput middleware', () => {
  test('should sanitize string fields in body', () => {
    const req = mockRequest({
      body: {
        name: '  John Doe  ',
        description: '<script>alert("xss")</script>',
        number: 123
      }
    });

    sanitizeInput(req, mockResponse(), mockNext);

    expect(req.body.name).toBe('John Doe');
    expect(req.body.description).toBe('scriptalert("xss")/script');
    expect(req.body.number).toBe(123); // Numbers should remain unchanged
  });

  test('should sanitize string fields in query', () => {
    const req = mockRequest({
      query: {
        search: '  test query  ',
        filter: '<script>',
        limit: '10'
      }
    });

    sanitizeInput(req, mockResponse(), mockNext);

    expect(req.query.search).toBe('test query');
    expect(req.query.filter).toBe('script');
    expect(req.query.limit).toBe('10');
  });
});

describe('validateContentType middleware', () => {
  test('should pass with valid content type', () => {
    const req = mockRequest({
      method: 'POST',
      get: jest.fn().mockReturnValue('application/json')
    });

    const middleware = validateContentType();
    
    expect(() => middleware(req, mockResponse(), mockNext)).not.toThrow();
  });

  test('should skip validation for GET requests', () => {
    const req = mockRequest({
      method: 'GET'
    });

    const middleware = validateContentType();
    
    expect(() => middleware(req, mockResponse(), mockNext)).not.toThrow();
    expect(mockNext).toHaveBeenCalled();
  });

  test('should throw error for missing content type', () => {
    const req = mockRequest({
      method: 'POST',
      get: jest.fn().mockReturnValue(null)
    });

    const middleware = validateContentType();
    
    expect(() => middleware(req, mockResponse(), mockNext)).toThrow(ValidationError);
  });

  test('should throw error for invalid content type', () => {
    const req = mockRequest({
      method: 'POST',
      get: jest.fn().mockReturnValue('text/plain')
    });

    const middleware = validateContentType();
    
    expect(() => middleware(req, mockResponse(), mockNext)).toThrow(ValidationError);
  });

  test('should accept custom allowed types', () => {
    const req = mockRequest({
      method: 'POST',
      get: jest.fn().mockReturnValue('application/xml')
    });

    const middleware = validateContentType(['application/xml']);
    
    expect(() => middleware(req, mockResponse(), mockNext)).not.toThrow();
  });
});

describe('validateRequestSize middleware', () => {
  test('should pass with valid request size', () => {
    const req = mockRequest({
      get: jest.fn().mockReturnValue('1000') // 1KB
    });

    const middleware = validateRequestSize(2000); // 2KB limit
    
    expect(() => middleware(req, mockResponse(), mockNext)).not.toThrow();
  });

  test('should throw error for oversized request', () => {
    const req = mockRequest({
      get: jest.fn().mockReturnValue('2000') // 2KB
    });

    const middleware = validateRequestSize(1000); // 1KB limit
    
    expect(() => middleware(req, mockResponse(), mockNext)).toThrow(ValidationError);
  });

  test('should pass when no content-length header', () => {
    const req = mockRequest({
      get: jest.fn().mockReturnValue(null)
    });

    const middleware = validateRequestSize(1000);
    
    expect(() => middleware(req, mockResponse(), mockNext)).not.toThrow();
  });
});