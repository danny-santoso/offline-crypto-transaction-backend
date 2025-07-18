/**
 * API Error Handling Middleware
 * Requirements: 9.4, 9.5
 */

import { Request, Response, NextFunction } from 'express';
import { BlockchainError, ErrorType } from '../services/errorHandler';

export interface ApiError extends Error {
  statusCode: number;
  code?: string;
  details?: any;
  isOperational?: boolean;
}

export enum ApiErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * Custom API Error class
 */
export class CustomApiError extends Error implements ApiError {
  public statusCode: number;
  public code: string;
  public details?: any;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = ApiErrorCode.INTERNAL_ERROR,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'CustomApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, CustomApiError);
  }
}

/**
 * Create specific error types
 */
export class ValidationError extends CustomApiError {
  constructor(message: string, details?: any) {
    super(message, 400, ApiErrorCode.VALIDATION_ERROR, details);
  }
}

export class NotFoundError extends CustomApiError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 404, ApiErrorCode.NOT_FOUND, details);
  }
}

export class ConflictError extends CustomApiError {
  constructor(message: string, details?: any) {
    super(message, 409, ApiErrorCode.CONFLICT, details);
  }
}

export class ServiceUnavailableError extends CustomApiError {
  constructor(message: string = 'Service temporarily unavailable', details?: any) {
    super(message, 503, ApiErrorCode.SERVICE_UNAVAILABLE, details);
  }
}

export class RateLimitError extends CustomApiError {
  constructor(message: string = 'Rate limit exceeded', details?: any) {
    super(message, 429, ApiErrorCode.RATE_LIMIT_EXCEEDED, details);
  }
}

export class BlockchainApiError extends CustomApiError {
  constructor(blockchainError: BlockchainError) {
    const statusCode = getStatusCodeFromBlockchainError(blockchainError);
    super(
      blockchainError.message,
      statusCode,
      ApiErrorCode.BLOCKCHAIN_ERROR,
      {
        type: blockchainError.type,
        retryable: blockchainError.retryable,
        context: blockchainError.context,
        timestamp: blockchainError.timestamp
      }
    );
  }
}

/**
 * Map blockchain error types to HTTP status codes
 */
function getStatusCodeFromBlockchainError(error: BlockchainError): number {
  switch (error.type) {
    case ErrorType.VALIDATION_ERROR:
    case ErrorType.SIGNATURE_ERROR:
    case ErrorType.INSUFFICIENT_FUNDS:
      return 400; // Bad Request
    case ErrorType.NETWORK_ERROR:
    case ErrorType.TIMEOUT_ERROR:
    case ErrorType.CONGESTION_ERROR:
      return 503; // Service Unavailable
    case ErrorType.GAS_ERROR:
    case ErrorType.NONCE_ERROR:
      return 422; // Unprocessable Entity
    case ErrorType.CONTRACT_ERROR:
    case ErrorType.TRANSACTION_ERROR:
    default:
      return 500; // Internal Server Error
  }
}

/**
 * Error logging utility
 */
export class ErrorLogger {
  private static logError(error: Error, req?: Request): void {
    const timestamp = new Date().toISOString();
    const requestInfo = req ? {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      body: req.method !== 'GET' ? req.body : undefined
    } : {};

    console.error(`[${timestamp}] API Error:`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error as ApiError).statusCode && { statusCode: (error as ApiError).statusCode },
      ...(error as ApiError).code && { code: (error as ApiError).code },
      ...(error as ApiError).details && { details: (error as ApiError).details },
      request: requestInfo
    });
  }

  public static logApiError(error: ApiError, req?: Request): void {
    this.logError(error, req);
  }

  public static logUnhandledError(error: Error, req?: Request): void {
    console.error(`[${new Date().toISOString()}] UNHANDLED ERROR:`, error);
    this.logError(error, req);
  }
}

/**
 * Global error handling middleware
 * Requirements: 9.4, 9.5
 */
export const globalErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Don't handle if response already sent
  if (res.headersSent) {
    return next(error);
  }

  let apiError: ApiError;

  // Convert different error types to ApiError
  if (error instanceof CustomApiError) {
    apiError = error;
  } else if (error.name === 'ValidationError') {
    apiError = new ValidationError(error.message);
  } else if (error.name === 'CastError') {
    apiError = new ValidationError('Invalid data format');
  } else if (error.name === 'MongoError' && (error as any).code === 11000) {
    apiError = new ConflictError('Duplicate entry');
  } else {
    // Unknown error - treat as internal server error
    apiError = new CustomApiError(
      'Internal server error',
      500,
      ApiErrorCode.INTERNAL_ERROR,
      undefined,
      false // Not operational
    );
  }

  // Log the error
  if (apiError.isOperational) {
    ErrorLogger.logApiError(apiError, req);
  } else {
    ErrorLogger.logUnhandledError(error, req);
  }

  // Send error response
  const errorResponse: any = {
    error: apiError.code || 'INTERNAL_ERROR',
    message: apiError.message,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  };

  // Include details in development mode or for operational errors
  if (process.env.NODE_ENV === 'development' || apiError.isOperational) {
    if (apiError.details) {
      errorResponse.details = apiError.details;
    }
  }

  // Include stack trace only in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = apiError.stack;
  }

  res.status(apiError.statusCode).json(errorResponse);
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.method} ${req.path} not found`);
  next(error);
};

/**
 * Async error wrapper to catch async errors in route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Request timeout middleware
 */
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        const error = new CustomApiError(
          'Request timeout',
          408,
          'REQUEST_TIMEOUT'
        );
        next(error);
      }
    }, timeoutMs);

    // Clear timeout when response is finished
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

/**
 * Health check error handler
 */
export const healthCheckErrorHandler = (error: any): {
  status: 'error';
  message: string;
  details?: any;
} => {
  if (error instanceof BlockchainApiError) {
    return {
      status: 'error',
      message: 'Blockchain service error',
      details: {
        type: error.details?.type,
        retryable: error.details?.retryable
      }
    };
  }

  if (error instanceof ServiceUnavailableError) {
    return {
      status: 'error',
      message: 'Service unavailable',
      details: error.details
    };
  }

  return {
    status: 'error',
    message: error.message || 'Unknown error',
    details: error.details
  };
};