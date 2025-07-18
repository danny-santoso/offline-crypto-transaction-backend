/**
 * Input Validation Middleware
 * Requirements: 9.4, 9.5
 */

import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './errorHandler';

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'ethereum_address';
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any) => boolean | string;
}

export interface ValidationSchema {
  body?: ValidationRule[];
  params?: ValidationRule[];
  query?: ValidationRule[];
}

/**
 * Validation utility functions
 */
export class ValidationUtils {
  /**
   * Check if value is a valid Ethereum address
   */
  static isEthereumAddress(value: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
  }

  /**
   * Check if value is a valid amount (positive number)
   */
  static isValidAmount(value: any): boolean {
    const num = Number(value);
    return !isNaN(num) && num > 0 && isFinite(num);
  }

  /**
   * Check if value is a valid token structure
   */
  static isValidToken(token: any): boolean {
    if (!token || typeof token !== 'object') return false;
    
    const requiredFields = ['tokenId', 'amount', 'issuer', 'issuedAt', 'expiresAt', 'signature', 'nonce'];
    return requiredFields.every(field => field in token);
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(value: string): string {
    return value.trim().replace(/[<>]/g, '');
  }

  /**
   * Validate array of tokens
   */
  static validateTokenArray(tokens: any[]): { valid: any[]; invalid: any[] } {
    const valid: any[] = [];
    const invalid: any[] = [];

    tokens.forEach((token, index) => {
      if (this.isValidToken(token)) {
        valid.push(token);
      } else {
        invalid.push({ index, token, reason: 'Invalid token structure' });
      }
    });

    return { valid, invalid };
  }
}

/**
 * Validate a single field
 */
function validateField(value: any, rule: ValidationRule): string | null {
  const { field, required, type, min, max, pattern, enum: enumValues, custom } = rule;

  // Check if required field is present
  if (required && (value === undefined || value === null || value === '')) {
    return `${field} is required`;
  }

  // Skip validation if field is not required and not present
  if (!required && (value === undefined || value === null)) {
    return null;
  }

  // Type validation
  if (type) {
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return `${field} must be a string`;
        }
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return `${field} must be a valid number`;
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          return `${field} must be a boolean`;
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          return `${field} must be an array`;
        }
        break;
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          return `${field} must be an object`;
        }
        break;
      case 'ethereum_address':
        if (typeof value !== 'string' || !ValidationUtils.isEthereumAddress(value)) {
          return `${field} must be a valid Ethereum address`;
        }
        break;
    }
  }

  // Min/Max validation
  if (typeof value === 'string' || Array.isArray(value)) {
    if (min !== undefined && value.length < min) {
      return `${field} must be at least ${min} characters/items long`;
    }
    if (max !== undefined && value.length > max) {
      return `${field} must be at most ${max} characters/items long`;
    }
  } else if (typeof value === 'number') {
    if (min !== undefined && value < min) {
      return `${field} must be at least ${min}`;
    }
    if (max !== undefined && value > max) {
      return `${field} must be at most ${max}`;
    }
  }

  // Pattern validation
  if (pattern && typeof value === 'string' && !pattern.test(value)) {
    return `${field} format is invalid`;
  }

  // Enum validation
  if (enumValues && !enumValues.includes(value)) {
    return `${field} must be one of: ${enumValues.join(', ')}`;
  }

  // Custom validation
  if (custom) {
    const customResult = custom(value);
    if (customResult !== true) {
      return typeof customResult === 'string' ? customResult : `${field} is invalid`;
    }
  }

  return null;
}

/**
 * Validate request data against schema
 */
function validateData(data: any, rules: ValidationRule[]): string[] {
  const errors: string[] = [];

  for (const rule of rules) {
    const value = data[rule.field];
    const error = validateField(value, rule);
    if (error) {
      errors.push(error);
    }
  }

  return errors;
}

/**
 * Create validation middleware
 */
export const validate = (schema: ValidationSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    // Validate body
    if (schema.body) {
      errors.push(...validateData(req.body, schema.body));
    }

    // Validate params
    if (schema.params) {
      errors.push(...validateData(req.params, schema.params));
    }

    // Validate query
    if (schema.query) {
      errors.push(...validateData(req.query, schema.query));
    }

    if (errors.length > 0) {
      throw new ValidationError('Validation failed', { errors });
    }

    next();
  };
};

/**
 * Common validation schemas
 */
export const ValidationSchemas = {
  // Balance endpoint validation
  getBalance: {
    params: [
      {
        field: 'address',
        required: true,
        type: 'ethereum_address' as const
      }
    ]
  },

  // Purchase tokens validation
  purchaseTokens: {
    body: [
      {
        field: 'amount',
        required: true,
        type: 'string' as const,
        custom: (value: any) => ValidationUtils.isValidAmount(value) || 'Amount must be a positive number'
      },
      {
        field: 'userAddress',
        required: true,
        type: 'ethereum_address' as const
      },
      {
        field: 'expiryHours',
        required: false,
        type: 'number' as const,
        min: 1,
        max: 8760 // 1 year
      }
    ]
  },

  // Redeem tokens validation
  redeemTokens: {
    body: [
      {
        field: 'tokens',
        required: true,
        type: 'array' as const,
        min: 1,
        custom: (tokens: any[]) => {
          const { invalid } = ValidationUtils.validateTokenArray(tokens);
          return invalid.length === 0 || `Invalid tokens found: ${invalid.length}`;
        }
      },
      {
        field: 'userAddress',
        required: true,
        type: 'ethereum_address' as const
      }
    ]
  },

  // Validate signature validation
  validateSignature: {
    body: [
      {
        field: 'token',
        required: true,
        type: 'object' as const,
        custom: (token: any) => ValidationUtils.isValidToken(token) || 'Invalid token structure'
      },
      {
        field: 'issuerAddress',
        required: false,
        type: 'ethereum_address' as const
      }
    ]
  },

  // Add public key validation
  addPublicKey: {
    body: [
      {
        field: 'address',
        required: true,
        type: 'ethereum_address' as const
      },
      {
        field: 'publicKey',
        required: true,
        type: 'string' as const,
        min: 1
      }
    ]
  },

  // Update public key validation
  updatePublicKey: {
    params: [
      {
        field: 'address',
        required: true,
        type: 'ethereum_address' as const
      }
    ],
    body: [
      {
        field: 'isActive',
        required: false,
        type: 'boolean' as const
      },
      {
        field: 'publicKey',
        required: false,
        type: 'string' as const,
        min: 1
      }
    ]
  },

  // Delete public key validation
  deletePublicKey: {
    params: [
      {
        field: 'address',
        required: true,
        type: 'ethereum_address' as const
      }
    ]
  },

  // Query validation for public keys
  getPublicKeys: {
    query: [
      {
        field: 'activeOnly',
        required: false,
        type: 'string' as const,
        enum: ['true', 'false']
      }
    ]
  }
};

/**
 * Sanitization middleware
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  // Sanitize string fields in body
  if (req.body && typeof req.body === 'object') {
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string') {
        req.body[key] = ValidationUtils.sanitizeString(value);
      }
    }
  }

  // Sanitize string fields in query
  if (req.query && typeof req.query === 'object') {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        req.query[key] = ValidationUtils.sanitizeString(value);
      }
    }
  }

  next();
};

/**
 * Content type validation middleware
 */
export const validateContentType = (allowedTypes: string[] = ['application/json']) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip validation for GET requests
    if (req.method === 'GET') {
      return next();
    }

    const contentType = req.get('Content-Type');
    
    if (!contentType) {
      throw new ValidationError('Content-Type header is required');
    }

    const isAllowed = allowedTypes.some(type => 
      contentType.toLowerCase().includes(type.toLowerCase())
    );

    if (!isAllowed) {
      throw new ValidationError(
        `Invalid Content-Type. Allowed types: ${allowedTypes.join(', ')}`,
        { received: contentType, allowed: allowedTypes }
      );
    }

    next();
  };
};

/**
 * Request size validation middleware
 */
export const validateRequestSize = (maxSizeBytes: number = 1024 * 1024) => { // 1MB default
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      throw new ValidationError(
        'Request payload too large',
        { 
          maxSize: maxSizeBytes,
          receivedSize: parseInt(contentLength)
        }
      );
    }

    next();
  };
};