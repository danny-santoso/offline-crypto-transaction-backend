import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import rateLimit from 'express-rate-limit';

// Extend Request interface to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        walletAddress: string;
        deviceId: string;
        sessionId: string;
        scope: string[];
      };
    }
  }
}

interface JWTPayload {
  sub: string; // wallet address
  iat: number;
  exp: number;
  scope: string[];
  device_id: string;
  session_id: string;
}

interface LoginRequest {
  wallet_address: string;
  signature: string;
  message: string;
  device_info: {
    device_id: string;
    platform: 'ios' | 'android';
    app_version: string;
    os_version: string;
  };
}

class AuthService {
  private jwtSecret: string;
  private refreshTokens: Map<string, { userId: string; deviceId: string; expiresAt: Date }> = new Map();
  private activeSessions: Map<string, { walletAddress: string; deviceId: string; lastActivity: Date }> = new Map();

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  }

  /**
   * Generate JWT access token
   */
  generateAccessToken(walletAddress: string, deviceId: string, scope: string[] = ['read:balance', 'write:transactions', 'read:keys']): string {
    const sessionId = this.generateSessionId();
    const payload: JWTPayload = {
      sub: walletAddress,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      scope,
      device_id: deviceId,
      session_id: sessionId
    };

    // Store active session
    this.activeSessions.set(sessionId, {
      walletAddress,
      deviceId,
      lastActivity: new Date()
    });

    return jwt.sign(payload, this.jwtSecret);
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(walletAddress: string, deviceId: string): string {
    const refreshToken = this.generateRandomToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    this.refreshTokens.set(refreshToken, {
      userId: walletAddress,
      deviceId,
      expiresAt
    });

    return refreshToken;
  }

  /**
   * Verify JWT token
   */
  verifyAccessToken(token: string): JWTPayload | null {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JWTPayload;
      
      // Check if session is still active
      const session = this.activeSessions.get(payload.session_id);
      if (!session || session.walletAddress !== payload.sub) {
        return null;
      }

      // Update last activity
      session.lastActivity = new Date();
      
      return payload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(refreshToken: string): { userId: string; deviceId: string } | null {
    const tokenData = this.refreshTokens.get(refreshToken);
    
    if (!tokenData || tokenData.expiresAt < new Date()) {
      if (tokenData) {
        this.refreshTokens.delete(refreshToken);
      }
      return null;
    }

    return {
      userId: tokenData.userId,
      deviceId: tokenData.deviceId
    };
  }

  /**
   * Verify wallet signature
   */
  verifyWalletSignature(walletAddress: string, message: string, signature: string): boolean {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate login message
   */
  generateLoginMessage(timestamp: string = new Date().toISOString()): string {
    return `Login to Offline Crypto App at ${timestamp}`;
  }

  /**
   * Invalidate session
   */
  logout(sessionId: string, refreshToken?: string): void {
    this.activeSessions.delete(sessionId);
    if (refreshToken) {
      this.refreshTokens.delete(refreshToken);
    }
  }

  /**
   * Clean up expired sessions and tokens
   */
  cleanup(): void {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Clean up inactive sessions
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.lastActivity < oneHourAgo) {
        this.activeSessions.delete(sessionId);
      }
    }

    // Clean up expired refresh tokens
    for (const [token, data] of this.refreshTokens.entries()) {
      if (data.expiresAt < now) {
        this.refreshTokens.delete(token);
      }
    }
  }

  private generateSessionId(): string {
    return 'sess_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private generateRandomToken(): string {
    return 'rt_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  }
}

// Singleton instance
export const authService = new AuthService();

// Clean up expired sessions every hour
setInterval(() => {
  authService.cleanup();
}, 60 * 60 * 1000);

/**
 * Authentication middleware
 */
export const authenticateToken = (requiredScope?: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    const payload = authService.verifyAccessToken(token);
    if (!payload) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired access token',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check required scope
    if (requiredScope && !requiredScope.every(scope => payload.scope.includes(scope))) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_SCOPE',
          message: 'Insufficient permissions for this operation',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Add user info to request
    req.user = {
      walletAddress: payload.sub,
      deviceId: payload.device_id,
      sessionId: payload.session_id,
      scope: payload.scope
    };

    next();
  };
};

/**
 * Rate limiting for authentication endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiting for mobile API endpoints
 */
export const mobileApiRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // 1000 requests per hour per IP
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Device authorization middleware
 */
export const authorizeDevice = (req: Request, res: Response, next: NextFunction) => {
  const deviceId = req.headers['x-device-id'] as string;
  
  if (!deviceId) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_DEVICE_ID',
        message: 'Device ID is required',
        timestamp: new Date().toISOString()
      }
    });
  }

  // Check if device matches the authenticated user's device
  if (req.user && req.user.deviceId !== deviceId) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'DEVICE_NOT_AUTHORIZED',
        message: 'Device not authorized for this account',
        timestamp: new Date().toISOString()
      }
    });
  }

  next();
};

export { LoginRequest };