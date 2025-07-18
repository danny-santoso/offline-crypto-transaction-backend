import { Router, Request, Response } from 'express';
import { authService, authenticateToken, authRateLimit, LoginRequest } from '../middleware/auth';
import { monitoringService } from '../services/monitoring';

const router = Router();

/**
 * @route POST /auth/login
 * @desc Authenticate user with wallet signature
 * @access Public
 */
router.post('/login', authRateLimit, async (req: Request, res: Response) => {
  try {
    const { wallet_address, signature, message, device_info }: LoginRequest = req.body;

    // Validate required fields
    if (!wallet_address || !signature || !message || !device_info?.device_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'wallet_address, signature, message, and device_info.device_id are required',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_WALLET_ADDRESS',
          message: 'Invalid wallet address format',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Verify the signature
    const isValidSignature = authService.verifyWalletSignature(wallet_address, message, signature);
    if (!isValidSignature) {
      monitoringService.recordError(new Error('Invalid signature attempt'), `login:${wallet_address}`);
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Invalid wallet signature',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check message timestamp (should be within 5 minutes)
    const messageTimestamp = message.match(/at (.+)$/)?.[1];
    if (messageTimestamp) {
      const timestamp = new Date(messageTimestamp);
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      if (timestamp < fiveMinutesAgo || timestamp > now) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'EXPIRED_MESSAGE',
            message: 'Login message is expired or invalid',
            timestamp: new Date().toISOString()
          }
        });
      }
    }

    // Generate tokens
    const accessToken = authService.generateAccessToken(wallet_address, device_info.device_id);
    const refreshToken = authService.generateRefreshToken(wallet_address, device_info.device_id);

    // TODO: Get user balance from blockchain service
    const userBalance = '0.0'; // Placeholder
    const offlineCredits = '0.0'; // Placeholder

    monitoringService.recordTransaction('login', 'authentication', 0, true);

    res.json({
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 86400, // 24 hours
        user: {
          wallet_address,
          balance: userBalance,
          offline_credits: offlineCredits
        }
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'auth login');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route POST /auth/refresh
 * @desc Refresh expired access token
 * @access Public
 */
router.post('/refresh', authRateLimit, async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REFRESH_TOKEN',
          message: 'Refresh token is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    const tokenData = authService.verifyRefreshToken(refresh_token);
    if (!tokenData) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Generate new access token
    const accessToken = authService.generateAccessToken(tokenData.userId, tokenData.deviceId);

    res.json({
      success: true,
      data: {
        access_token: accessToken,
        expires_in: 86400 // 24 hours
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'auth refresh');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Token refresh failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route POST /auth/logout
 * @desc Invalidate current session
 * @access Private
 */
router.post('/logout', authenticateToken(), async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;
    const sessionId = req.user?.sessionId;

    if (sessionId) {
      authService.logout(sessionId, refresh_token);
    }

    res.json({
      success: true,
      data: {
        message: 'Logged out successfully'
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'auth logout');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Logout failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route GET /auth/me
 * @desc Get current user information
 * @access Private
 */
router.get('/me', authenticateToken(), async (req: Request, res: Response) => {
  try {
    const walletAddress = req.user?.walletAddress;
    const deviceId = req.user?.deviceId;

    // TODO: Get user balance and account info from blockchain service
    const userBalance = '0.0'; // Placeholder
    const offlineCredits = '0.0'; // Placeholder

    res.json({
      success: true,
      data: {
        wallet_address: walletAddress,
        device_id: deviceId,
        balance: userBalance,
        offline_credits: offlineCredits,
        scope: req.user?.scope || [],
        authenticated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'auth me');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get user information',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route POST /auth/generate-message
 * @desc Generate login message for wallet signing
 * @access Public
 */
router.post('/generate-message', (req: Request, res: Response) => {
  try {
    const timestamp = new Date().toISOString();
    const message = authService.generateLoginMessage(timestamp);

    res.json({
      success: true,
      data: {
        message,
        timestamp
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'auth generate-message');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to generate login message',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route GET /auth/status
 * @desc Check authentication status
 * @access Private
 */
router.get('/status', authenticateToken(), (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      authenticated: true,
      wallet_address: req.user?.walletAddress,
      device_id: req.user?.deviceId,
      scope: req.user?.scope || [],
      session_id: req.user?.sessionId
    }
  });
});

export default router;