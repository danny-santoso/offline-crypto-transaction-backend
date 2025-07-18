import { Router, Request, Response } from 'express';
import { authenticateToken, authorizeDevice, mobileApiRateLimit } from '../middleware/auth';
import { monitoringService } from '../services/monitoring';
import { deploymentConfigService } from '../services/deploymentConfig';
import { tokenDivisionService, TokenSplitRequest, ChangeCalculationRequest } from '../services/tokenDivisionService';

const router = Router();

// Apply rate limiting to all mobile routes
router.use(mobileApiRateLimit);

/**
 * @route GET /mobile/balance
 * @desc Get user's current balance and offline credits
 * @access Private
 */
router.get('/balance', authenticateToken(['read:balance']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const walletAddress = req.user?.walletAddress;

    // TODO: Integrate with blockchain service to get real balance
    const balance = '1.5'; // Placeholder
    const offlineCredits = '0.5'; // Placeholder
    const pendingTransactions = 0; // Placeholder

    res.json({
      success: true,
      data: {
        wallet_address: walletAddress,
        balance,
        offline_credits: offlineCredits,
        pending_transactions: pendingTransactions,
        last_sync: new Date().toISOString()
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'mobile balance');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get balance',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route GET /mobile/account/info
 * @desc Get comprehensive account information
 * @access Private
 */
router.get('/account/info', authenticateToken(['read:balance']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const walletAddress = req.user?.walletAddress;

    // TODO: Integrate with blockchain service for real data
    const accountInfo = {
      wallet_address: walletAddress,
      balance: '1.5',
      offline_credits: '0.5',
      total_transactions: 25,
      account_created: '2024-01-01T00:00:00Z',
      last_activity: new Date().toISOString(),
      verification_status: 'verified',
      limits: {
        daily_purchase_limit: '10.0',
        daily_redemption_limit: '5.0',
        offline_token_limit: '2.0'
      }
    };

    res.json({
      success: true,
      data: accountInfo
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'mobile account info');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get account information',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route POST /mobile/tokens/purchase
 * @desc Purchase offline tokens
 * @access Private
 */
router.post('/tokens/purchase', authenticateToken(['write:transactions']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const { amount, payment_method, device_location, offline_mode } = req.body;
    const walletAddress = req.user?.walletAddress;

    // Validate required fields
    if (!amount || !payment_method) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'amount and payment_method are required',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate amount
    const purchaseAmount = parseFloat(amount);
    if (isNaN(purchaseAmount) || purchaseAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Amount must be a positive number',
          timestamp: new Date().toISOString()
        }
      });
    }

    // TODO: Integrate with blockchain service for actual token purchase
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const fee = (purchaseAmount * 0.01).toFixed(2); // 1% fee
    const total = (purchaseAmount + parseFloat(fee)).toFixed(2);

    // Generate mock offline tokens
    const offlineTokens = [
      {
        token_id: `ot_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        amount: (purchaseAmount / 2).toFixed(2),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        signature: '0x' + Math.random().toString(16).substring(2, 66),
        qr_code: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      },
      {
        token_id: `ot_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        amount: (purchaseAmount / 2).toFixed(2),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        signature: '0x' + Math.random().toString(16).substring(2, 66),
        qr_code: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      }
    ];

    monitoringService.recordTransaction(transactionId, 'purchase', 21000, true);

    res.json({
      success: true,
      data: {
        transaction_id: transactionId,
        amount: amount,
        fee,
        total,
        status: 'confirmed',
        offline_tokens: offlineTokens
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'mobile token purchase');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Token purchase failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route POST /mobile/tokens/redeem
 * @desc Redeem offline tokens for cryptocurrency
 * @access Private
 */
router.post('/tokens/redeem', authenticateToken(['write:transactions']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const { tokens, destination_address } = req.body;
    const walletAddress = req.user?.walletAddress;

    // Validate required fields
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TOKENS',
          message: 'tokens array is required and must not be empty',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate destination address
    const destination = destination_address || walletAddress;
    if (!/^0x[a-fA-F0-9]{40}$/.test(destination)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DESTINATION_ADDRESS',
          message: 'Invalid destination address format',
          timestamp: new Date().toISOString()
        }
      });
    }

    // TODO: Validate token signatures and redeem through blockchain service
    const totalAmount = tokens.reduce((sum, token) => sum + parseFloat(token.amount || '0'), 0);
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    monitoringService.recordTransaction(transactionId, 'redeem', 21000, true);

    res.json({
      success: true,
      data: {
        transaction_id: transactionId,
        total_amount: totalAmount.toFixed(2),
        destination_address: destination,
        status: 'confirmed',
        redeemed_tokens: tokens.length
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'mobile token redeem');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Token redemption failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route POST /mobile/tokens/validate
 * @desc Validate offline token signature
 * @access Private
 */
router.post('/tokens/validate', authenticateToken(['read:keys']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const { token_id, signature, amount, issuer, nonce } = req.body;

    // Validate required fields
    if (!token_id || !signature || !amount || !issuer || nonce === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'token_id, signature, amount, issuer, and nonce are required',
          timestamp: new Date().toISOString()
        }
      });
    }

    // TODO: Integrate with blockchain service for actual signature validation
    const isValid = Math.random() > 0.1; // 90% success rate for demo

    res.json({
      success: true,
      data: {
        token_id,
        is_valid: isValid,
        validation_timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'mobile token validate');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Token validation failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route GET /mobile/transactions
 * @desc Get user's transaction history with pagination
 * @access Private
 */
router.get('/transactions', authenticateToken(['read:balance']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const type = req.query.type as string;
    const status = req.query.status as string;
    const fromDate = req.query.from_date as string;
    const toDate = req.query.to_date as string;

    // TODO: Integrate with blockchain service for real transaction history
    const mockTransactions = [
      {
        id: 'tx_123456789',
        type: 'purchase',
        amount: '1.0',
        fee: '0.01',
        status: 'confirmed',
        created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        confirmed_at: new Date(Date.now() - 24 * 60 * 60 * 1000 + 60000).toISOString(),
        block_number: 12345678,
        transaction_hash: '0x' + Math.random().toString(16).substring(2, 66)
      },
      {
        id: 'tx_987654321',
        type: 'redeem',
        amount: '0.5',
        fee: '0.005',
        status: 'confirmed',
        created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        confirmed_at: new Date(Date.now() - 12 * 60 * 60 * 1000 + 45000).toISOString(),
        block_number: 12345680,
        transaction_hash: '0x' + Math.random().toString(16).substring(2, 66)
      }
    ];

    // Apply filters
    let filteredTransactions = mockTransactions;
    if (type) {
      filteredTransactions = filteredTransactions.filter(tx => tx.type === type);
    }
    if (status) {
      filteredTransactions = filteredTransactions.filter(tx => tx.status === status);
    }

    const totalItems = filteredTransactions.length;
    const totalPages = Math.ceil(totalItems / limit);
    const startIndex = (page - 1) * limit;
    const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + limit);

    res.json({
      success: true,
      data: {
        transactions: paginatedTransactions,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_items: totalItems,
          items_per_page: limit
        }
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'mobile transactions');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get transactions',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route GET /mobile/offline-tokens
 * @desc Get user's offline tokens
 * @access Private
 */
router.get('/offline-tokens', authenticateToken(['read:balance']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const includeExpired = req.query.include_expired === 'true';

    // TODO: Integrate with blockchain service for real offline tokens
    const mockTokens = [
      {
        token_id: 'ot_abc123',
        amount: '0.5',
        status: 'active',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        signature: '0x' + Math.random().toString(16).substring(2, 66),
        qr_code: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        issuer: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4',
        nonce: 12345
      },
      {
        token_id: 'ot_def456',
        amount: '1.0',
        status: 'expired',
        created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        signature: '0x' + Math.random().toString(16).substring(2, 66),
        qr_code: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        issuer: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4',
        nonce: 12346
      }
    ];

    // Apply filters
    let filteredTokens = mockTokens;
    if (status) {
      filteredTokens = filteredTokens.filter(token => token.status === status);
    }
    if (!includeExpired) {
      filteredTokens = filteredTokens.filter(token => token.status !== 'expired');
    }

    const summary = {
      total_tokens: mockTokens.length,
      active_tokens: mockTokens.filter(t => t.status === 'active').length,
      expired_tokens: mockTokens.filter(t => t.status === 'expired').length,
      total_value: mockTokens.reduce((sum, token) => sum + parseFloat(token.amount), 0).toFixed(2)
    };

    res.json({
      success: true,
      data: {
        tokens: filteredTokens,
        summary
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'mobile offline tokens');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get offline tokens',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route GET /mobile/public-keys
 * @desc Get authorized OTM public keys for offline validation
 * @access Private
 */
router.get('/public-keys', authenticateToken(['read:keys']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    // TODO: Get real public keys from blockchain service
    const mockPublicKeys = [
      {
        address: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4',
        public_key: '0x04' + Math.random().toString(16).substring(2, 130),
        status: 'active',
        added_at: '2024-01-01T00:00:00Z',
        expires_at: '2024-12-31T23:59:59Z'
      },
      {
        address: '0x8ba1f109551bD432803012645Hac136c30C6213',
        public_key: '0x04' + Math.random().toString(16).substring(2, 130),
        status: 'active',
        added_at: '2024-01-01T00:00:00Z',
        expires_at: '2024-12-31T23:59:59Z'
      }
    ];

    res.json({
      success: true,
      data: {
        public_keys: mockPublicKeys,
        last_updated: new Date().toISOString(),
        cache_duration: 3600 // 1 hour
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'mobile public keys');
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get public keys',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route POST /mobile/tokens/split
 * @desc Split an offline token into smaller denominations
 * @access Private
 */
router.post('/tokens/split', authenticateToken(['write:transactions']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const { token_id, original_amount, split_amounts, signature, nonce, issuer }: TokenSplitRequest = req.body;

    // Validate required fields
    if (!token_id || !original_amount || !split_amounts || !signature || nonce === undefined || !issuer) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'token_id, original_amount, split_amounts, signature, nonce, and issuer are required',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate split amounts array
    if (!Array.isArray(split_amounts) || split_amounts.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SPLIT_AMOUNTS',
          message: 'split_amounts must be a non-empty array',
          timestamp: new Date().toISOString()
        }
      });
    }

    const splitRequest: TokenSplitRequest = {
      token_id,
      original_amount,
      split_amounts,
      signature,
      nonce,
      issuer
    };

    const result = await tokenDivisionService.splitToken(splitRequest);

    monitoringService.recordTransaction(token_id, 'split', 0, true);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'mobile token split');
    res.status(500).json({
      success: false,
      error: {
        code: 'TOKEN_SPLIT_FAILED',
        message: (error as Error).message || 'Token split failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route POST /mobile/tokens/calculate-change
 * @desc Calculate optimal change for a payment
 * @access Private
 */
router.post('/tokens/calculate-change', authenticateToken(['read:balance']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const { payment_amount, target_amount, available_tokens }: ChangeCalculationRequest = req.body;

    // Validate required fields
    if (!payment_amount || !target_amount || !available_tokens) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'payment_amount, target_amount, and available_tokens are required',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate available tokens array
    if (!Array.isArray(available_tokens)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_AVAILABLE_TOKENS',
          message: 'available_tokens must be an array',
          timestamp: new Date().toISOString()
        }
      });
    }

    const changeRequest: ChangeCalculationRequest = {
      payment_amount,
      target_amount,
      available_tokens
    };

    const result = tokenDivisionService.calculateOptimalChange(changeRequest);

    monitoringService.recordPerformance('change_calculation', 100, true);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'mobile change calculation');
    res.status(500).json({
      success: false,
      error: {
        code: 'CHANGE_CALCULATION_FAILED',
        message: (error as Error).message || 'Change calculation failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route POST /mobile/tokens/validate-precision
 * @desc Validate mathematical precision of token amounts
 * @access Private
 */
router.post('/tokens/validate-precision', authenticateToken(['read:balance']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    const { amounts } = req.body;

    // Validate required fields
    if (!amounts || !Array.isArray(amounts)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_AMOUNTS',
          message: 'amounts array is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    const result = tokenDivisionService.validatePrecision(amounts);

    res.json({
      success: true,
      data: {
        is_valid: result.isValid,
        errors: result.errors,
        validation_timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'mobile precision validation');
    res.status(500).json({
      success: false,
      error: {
        code: 'PRECISION_VALIDATION_FAILED',
        message: 'Precision validation failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * @route GET /mobile/tokens/test-scenarios
 * @desc Generate test scenarios for token division (development/testing only)
 * @access Private
 */
router.get('/tokens/test-scenarios', authenticateToken(['read:balance']), authorizeDevice, async (req: Request, res: Response) => {
  try {
    // Only allow in development environment
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'NOT_AVAILABLE_IN_PRODUCTION',
          message: 'Test scenarios are not available in production',
          timestamp: new Date().toISOString()
        }
      });
    }

    const scenarios = tokenDivisionService.generateTestScenarios();

    res.json({
      success: true,
      data: scenarios
    });

  } catch (error) {
    monitoringService.recordError(error as Error, 'mobile test scenarios');
    res.status(500).json({
      success: false,
      error: {
        code: 'TEST_SCENARIOS_FAILED',
        message: 'Failed to generate test scenarios',
        timestamp: new Date().toISOString()
      }
    });
  }
});

export default router;