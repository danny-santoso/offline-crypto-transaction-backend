import { Router, Request, Response } from 'express';
import { OTMService } from '../services/otmService';

const router = Router();

// Initialize OTM service
const otmService = new OTMService();

// In-memory storage for public keys (in production, this should be a database)
interface PublicKeyEntry {
  address: string;
  publicKey: string;
  isActive: boolean;
  createdAt: Date;
  lastUpdated: Date;
}

// Mock public key database
let publicKeyDatabase: Map<string, PublicKeyEntry> = new Map();

// Initialize with OTM key pair
const initializeKeyDatabase = () => {
  if (publicKeyDatabase.size === 0) {
    const keyPair = otmService.generateKeyPair();
    if (keyPair) {
      publicKeyDatabase.set(keyPair.address, {
        address: keyPair.address,
        publicKey: keyPair.publicKey,
        isActive: true,
        createdAt: new Date(),
        lastUpdated: new Date()
      });
    }
  }
};

// Initialize the database
initializeKeyDatabase();

/**
 * GET /api/public-keys - Get public key database for key distribution
 * Requirements: 5.4, 5.5, 9.3
 */
router.get('/public-keys', async (req: Request, res: Response) => {
  try {
    const { activeOnly = 'true' } = req.query;
    
    // Convert Map to array and filter if needed
    const keys = Array.from(publicKeyDatabase.values());
    const filteredKeys = activeOnly === 'true' 
      ? keys.filter(key => key.isActive)
      : keys;

    // Return public information only (no private keys)
    const publicKeys = filteredKeys.map(key => ({
      address: key.address,
      publicKey: key.publicKey,
      isActive: key.isActive,
      createdAt: key.createdAt,
      lastUpdated: key.lastUpdated
    }));

    return res.json({
      success: true,
      message: 'Public keys retrieved successfully',
      keys: publicKeys,
      totalCount: publicKeys.length,
      activeCount: keys.filter(key => key.isActive).length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error retrieving public keys:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve public keys'
    });
  }
});

/**
 * POST /api/validate-signature - Validate token signature
 * Requirements: 5.4, 5.5, 9.3
 */
router.post('/validate-signature', async (req: Request, res: Response) => {
  try {
    const { token, issuerAddress } = req.body;

    // Validate required fields
    if (!token) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'token is required'
      });
    }

    // Validate token structure
    const requiredFields = ['tokenId', 'amount', 'issuer', 'issuedAt', 'expiresAt', 'signature', 'nonce'];
    const missingFields = requiredFields.filter(field => !(field in token));
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Invalid token structure',
        message: `Missing required token fields: ${missingFields.join(', ')}`
      });
    }

    // Check if issuer exists in public key database
    const issuerKey = publicKeyDatabase.get(token.issuer);
    if (!issuerKey) {
      return res.status(400).json({
        error: 'Unknown issuer',
        message: 'Token issuer not found in public key database'
      });
    }

    if (!issuerKey.isActive) {
      return res.status(400).json({
        error: 'Inactive issuer',
        message: 'Token issuer is no longer active'
      });
    }

    // Validate token signature and expiry
    const validation = otmService.validateTokenWithExpiry(token, issuerAddress);
    const tokenInfo = otmService.getTokenInfo(token);

    const response = {
      success: true,
      message: 'Token validation completed',
      validation: {
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings,
        signatureValid: otmService.verifyTokenSignature(token, issuerAddress),
        issuerVerified: true,
        issuerActive: issuerKey.isActive
      },
      token: {
        tokenId: token.tokenId,
        amount: {
          wei: token.amount,
          ether: tokenInfo.amountInEther
        },
        issuer: token.issuer,
        issuedAt: tokenInfo.issuedAt,
        expiresAt: tokenInfo.expiresAt,
        isExpired: tokenInfo.isExpired
      },
      expiryInfo: validation.expiryInfo,
      timestamp: new Date().toISOString()
    };

    // Return appropriate status code based on validation result
    if (validation.isValid) {
      return res.json(response);
    } else {
      return res.status(400).json({
        ...response,
        success: false,
        message: 'Token validation failed'
      });
    }

  } catch (error) {
    console.error('Error validating signature:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate token signature'
    });
  }
});

/**
 * POST /api/public-keys - Add new public key (admin endpoint)
 * Requirements: 5.4, 5.5, 9.3
 */
router.post('/public-keys', async (req: Request, res: Response) => {
  try {
    const { address, publicKey } = req.body;

    // Validate required fields
    if (!address || !publicKey) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'address and publicKey are required'
      });
    }

    // Check if key already exists
    if (publicKeyDatabase.has(address)) {
      return res.status(409).json({
        error: 'Key already exists',
        message: 'A key with this address already exists'
      });
    }

    // Add new key to database
    const newKey: PublicKeyEntry = {
      address,
      publicKey,
      isActive: true,
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    publicKeyDatabase.set(address, newKey);

    return res.status(201).json({
      success: true,
      message: 'Public key added successfully',
      key: {
        address: newKey.address,
        publicKey: newKey.publicKey,
        isActive: newKey.isActive,
        createdAt: newKey.createdAt
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error adding public key:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add public key'
    });
  }
});

/**
 * PUT /api/public-keys/:address - Update public key status (key rotation)
 * Requirements: 5.4, 5.5, 9.3
 */
router.put('/public-keys/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { isActive, publicKey } = req.body;

    // Check if key exists
    const existingKey = publicKeyDatabase.get(address);
    if (!existingKey) {
      return res.status(404).json({
        error: 'Key not found',
        message: 'Public key with this address not found'
      });
    }

    // Update key
    const updatedKey: PublicKeyEntry = {
      ...existingKey,
      ...(typeof isActive === 'boolean' && { isActive }),
      ...(publicKey && { publicKey }),
      lastUpdated: new Date()
    };

    publicKeyDatabase.set(address, updatedKey);

    return res.json({
      success: true,
      message: 'Public key updated successfully',
      key: {
        address: updatedKey.address,
        publicKey: updatedKey.publicKey,
        isActive: updatedKey.isActive,
        lastUpdated: updatedKey.lastUpdated
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error updating public key:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update public key'
    });
  }
});

/**
 * DELETE /api/public-keys/:address - Deactivate public key
 * Requirements: 5.4, 5.5, 9.3
 */
router.delete('/public-keys/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    // Check if key exists
    const existingKey = publicKeyDatabase.get(address);
    if (!existingKey) {
      return res.status(404).json({
        error: 'Key not found',
        message: 'Public key with this address not found'
      });
    }

    // Deactivate key instead of deleting (for audit trail)
    const deactivatedKey: PublicKeyEntry = {
      ...existingKey,
      isActive: false,
      lastUpdated: new Date()
    };

    publicKeyDatabase.set(address, deactivatedKey);

    return res.json({
      success: true,
      message: 'Public key deactivated successfully',
      key: {
        address: deactivatedKey.address,
        isActive: deactivatedKey.isActive,
        lastUpdated: deactivatedKey.lastUpdated
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error deactivating public key:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to deactivate public key'
    });
  }
});

export default router;