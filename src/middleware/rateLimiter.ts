/**
 * Rate Limiting Middleware
 * Requirements: 9.4, 9.5
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimitError } from './errorHandler';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
}

export interface RateLimitInfo {
  totalHits: number;
  totalHitsPerWindow: number;
  resetTime: Date;
  remaining: number;
}

/**
 * In-memory rate limit store
 * In production, this should be replaced with Redis or similar
 */
class MemoryStore {
  private hits: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.hits.entries()) {
      if (now > value.resetTime) {
        this.hits.delete(key);
      }
    }
  }

  public increment(key: string, windowMs: number): RateLimitInfo {
    const now = Date.now();
    const resetTime = now + windowMs;
    
    const existing = this.hits.get(key);
    
    if (!existing || now > existing.resetTime) {
      // First request or window expired
      this.hits.set(key, { count: 1, resetTime });
      return {
        totalHits: 1,
        totalHitsPerWindow: 1,
        resetTime: new Date(resetTime),
        remaining: 0 // Will be calculated by caller
      };
    } else {
      // Increment existing count
      existing.count++;
      this.hits.set(key, existing);
      return {
        totalHits: existing.count,
        totalHitsPerWindow: existing.count,
        resetTime: new Date(existing.resetTime),
        remaining: 0 // Will be calculated by caller
      };
    }
  }

  public get(key: string): RateLimitInfo | null {
    const existing = this.hits.get(key);
    if (!existing) return null;

    const now = Date.now();
    if (now > existing.resetTime) {
      this.hits.delete(key);
      return null;
    }

    return {
      totalHits: existing.count,
      totalHitsPerWindow: existing.count,
      resetTime: new Date(existing.resetTime),
      remaining: 0 // Will be calculated by caller
    };
  }

  public reset(key: string): void {
    this.hits.delete(key);
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.hits.clear();
  }
}

// Global store instance
const globalStore = new MemoryStore();

/**
 * Default key generator - uses IP address
 */
const defaultKeyGenerator = (req: Request): string => {
  return req.ip || req.connection.remoteAddress || 'unknown';
};

/**
 * Create rate limiting middleware
 */
export const rateLimit = (config: RateLimitConfig) => {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = defaultKeyGenerator,
    onLimitReached
  } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = keyGenerator(req);
      const info = globalStore.increment(key, windowMs);
      
      // Calculate remaining requests
      info.remaining = Math.max(0, maxRequests - info.totalHitsPerWindow);

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': info.remaining.toString(),
        'X-RateLimit-Reset': Math.ceil(info.resetTime.getTime() / 1000).toString(),
        'X-RateLimit-Window': Math.ceil(windowMs / 1000).toString()
      });

      // Check if limit exceeded
      if (info.totalHitsPerWindow > maxRequests) {
        // Add retry-after header
        const retryAfter = Math.ceil((info.resetTime.getTime() - Date.now()) / 1000);
        res.set('Retry-After', retryAfter.toString());

        // Call onLimitReached callback if provided
        if (onLimitReached) {
          onLimitReached(req, res);
        }

        const error = new RateLimitError(message, {
          limit: maxRequests,
          current: info.totalHitsPerWindow,
          resetTime: info.resetTime,
          retryAfter
        });
        
        next(error);
        return;
      }

      // Handle response to potentially skip counting
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalSend = res.send;
        res.send = function(body) {
          const statusCode = res.statusCode;
          const shouldSkip = 
            (skipSuccessfulRequests && statusCode < 400) ||
            (skipFailedRequests && statusCode >= 400);

          if (shouldSkip) {
            // Decrement the counter
            const currentInfo = globalStore.get(key);
            if (currentInfo && currentInfo.totalHitsPerWindow > 0) {
              globalStore.increment(key, windowMs); // This will reset if needed
              // Manually adjust the count
              const existing = (globalStore as any).hits.get(key);
              if (existing) {
                existing.count = Math.max(0, existing.count - 1);
              }
            }
          }

          return originalSend.call(this, body);
        };
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Predefined rate limit configurations
 */
export const RateLimitConfigs = {
  // General API rate limit
  general: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    message: 'Too many requests from this IP, please try again later'
  },

  // Strict rate limit for sensitive operations
  strict: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    message: 'Too many requests for this operation, please try again later'
  },

  // Rate limit for token operations
  tokenOperations: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 20,
    message: 'Too many token operations, please try again later'
  },

  // Rate limit for validation operations
  validation: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 50,
    message: 'Too many validation requests, please try again later'
  },

  // Rate limit for public key operations
  publicKeyOperations: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 5,
    message: 'Too many public key operations, please try again later'
  }
};

/**
 * Create rate limiter by IP and user (if authenticated)
 */
export const createUserRateLimit = (config: RateLimitConfig) => {
  return rateLimit({
    ...config,
    keyGenerator: (req: Request) => {
      // In a real app, you'd extract user ID from authentication
      const userId = req.headers['x-user-id'] as string;
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return userId ? `user:${userId}` : `ip:${ip}`;
    }
  });
};

/**
 * Create rate limiter by endpoint
 */
export const createEndpointRateLimit = (config: RateLimitConfig) => {
  return rateLimit({
    ...config,
    keyGenerator: (req: Request) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const endpoint = `${req.method}:${req.route?.path || req.path}`;
      return `${ip}:${endpoint}`;
    }
  });
};

/**
 * Rate limit bypass for testing
 */
export const bypassRateLimit = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === 'test' || req.headers['x-bypass-rate-limit'] === 'true') {
    return next();
  }
  next();
};

/**
 * Get rate limit status for a key
 */
export const getRateLimitStatus = (key: string): RateLimitInfo | null => {
  return globalStore.get(key);
};

/**
 * Reset rate limit for a key
 */
export const resetRateLimit = (key: string): void => {
  globalStore.reset(key);
};

/**
 * Cleanup rate limiter resources
 */
export const cleanupRateLimiter = (): void => {
  globalStore.destroy();
};