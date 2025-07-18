import { Router, Request, Response } from 'express';
import { Web3Service } from '../services/web3Service';
import { OTMService } from '../services/otmService';
import { ContractService } from '../services/contractService';

const router = Router();

// Initialize services
const web3Service = new Web3Service();
const otmService = new OTMService();
const contractService = new ContractService(web3Service);

// Initialize OTM key pair (in production, this should be loaded from secure storage)
otmService.generateKeyPair();

/**
 * GET /api/balance/:address - Get user balance queries
 * Requirements: 1.1, 1.5, 4.1, 4.2, 9.1
 */
router.get('/balance/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    // Validate Ethereum address format
    if (!web3Service.getWeb3().utils.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid address format',
        message: 'Please provide a valid Ethereum address'
      });
    }

    // Check if connected to blockchain
    const isConnected = await web3Service.isConnected();
    if (!isConnected) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Unable to connect to Ethereum network'
      });
    }

    // Get balance from blockchain
    const balanceWei = await web3Service.getBalance(address);
    const balanceEther = web3Service.weiToEther(balanceWei);

    return res.json({
      address,
      balance: {
        wei: balanceWei.toString(),
        ether: balanceEther
      },
      network: {
        chainId: await web3Service.getNetworkId(),
        blockNumber: await web3Service.getCurrentBlock()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting balance:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve balance'
    });
  }
});

/**
 * POST /api/purchase-tokens - Purchase offline tokens
 * Requirements: 1.1, 1.5, 4.1, 4.2, 9.1
 */
router.post('/purchase-tokens', async (req: Request, res: Response) => {
  try {
    const { amount, userAddress, expiryHours = 24 } = req.body;

    // Validate required fields
    if (!amount || !userAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'amount and userAddress are required'
      });
    }

    // Validate Ethereum address format
    if (!web3Service.getWeb3().utils.isAddress(userAddress)) {
      return res.status(400).json({
        error: 'Invalid address format',
        message: 'Please provide a valid Ethereum address'
      });
    }

    // Validate amount
    let amountWei: bigint;
    try {
      amountWei = web3Service.etherToWei(amount.toString());
      if (amountWei <= 0n) {
        throw new Error('Amount must be greater than 0');
      }
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid amount',
        message: 'Please provide a valid amount in Ether'
      });
    }

    // Validate expiry hours
    if (typeof expiryHours !== 'number' || expiryHours <= 0 || expiryHours > 8760) { // Max 1 year
      return res.status(400).json({
        error: 'Invalid expiry hours',
        message: 'Expiry hours must be between 1 and 8760 (1 year)'
      });
    }

    // Check if connected to blockchain
    const isConnected = await web3Service.isConnected();
    if (!isConnected) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Unable to connect to Ethereum network'
      });
    }

    // Check user balance
    const userBalance = await web3Service.getBalance(userAddress);
    if (userBalance < amountWei) {
      return res.status(400).json({
        error: 'Insufficient balance',
        message: `User balance (${web3Service.weiToEther(userBalance)} ETH) is less than requested amount (${amount} ETH)`
      });
    }

    // Issue offline token
    const token = otmService.issueToken(amountWei.toString(), expiryHours);
    const tokenInfo = otmService.getTokenInfo(token);

    return res.json({
      success: true,
      message: 'Offline tokens purchased successfully',
      token: {
        tokenId: token.tokenId,
        amount: {
          wei: token.amount,
          ether: tokenInfo.amountInEther
        },
        issuer: token.issuer,
        issuedAt: tokenInfo.issuedAt,
        expiresAt: tokenInfo.expiresAt,
        signature: token.signature,
        nonce: token.nonce
      },
      userAddress,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error purchasing tokens:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to purchase offline tokens'
    });
  }
});

/**
 * POST /api/redeem-tokens - Redeem offline tokens
 * Requirements: 1.1, 1.5, 4.1, 4.2, 9.1
 */
router.post('/redeem-tokens', async (req: Request, res: Response) => {
  try {
    const { tokens, userAddress } = req.body;

    // Validate required fields
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'tokens array is required and must not be empty'
      });
    }

    if (!userAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'userAddress is required'
      });
    }

    // Validate Ethereum address format
    if (!web3Service.getWeb3().utils.isAddress(userAddress)) {
      return res.status(400).json({
        error: 'Invalid address format',
        message: 'Please provide a valid Ethereum address'
      });
    }

    // Check if connected to blockchain
    const isConnected = await web3Service.isConnected();
    if (!isConnected) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Unable to connect to Ethereum network'
      });
    }

    // Validate and process tokens
    const validTokens = [];
    const invalidTokens = [];
    let totalAmount = 0n;

    for (const token of tokens) {
      const validation = otmService.validateTokenWithExpiry(token);
      
      if (validation.isValid) {
        validTokens.push({
          token,
          warnings: validation.warnings
        });
        totalAmount += BigInt(token.amount);
      } else {
        invalidTokens.push({
          token: token.tokenId || 'unknown',
          errors: validation.errors
        });
      }
    }

    // If no valid tokens, return error
    if (validTokens.length === 0) {
      return res.status(400).json({
        error: 'No valid tokens',
        message: 'All provided tokens are invalid',
        invalidTokens
      });
    }

    // TODO: In a real implementation, this would interact with the smart contract
    // to actually transfer the cryptocurrency back to the user
    // For now, we'll simulate the redemption process

    const redemptionResult = {
      success: true,
      message: 'Tokens redeemed successfully',
      redemption: {
        userAddress,
        totalAmount: {
          wei: totalAmount.toString(),
          ether: web3Service.weiToEther(totalAmount)
        },
        validTokensCount: validTokens.length,
        invalidTokensCount: invalidTokens.length,
        // In real implementation, this would be the actual transaction hash
        transactionHash: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
        blockNumber: await web3Service.getCurrentBlock(),
        gasUsed: '21000' // Simulated gas usage
      },
      validTokens: validTokens.map(vt => ({
        tokenId: vt.token.tokenId,
        amount: {
          wei: vt.token.amount,
          ether: web3Service.weiToEther(BigInt(vt.token.amount))
        },
        warnings: vt.warnings
      })),
      ...(invalidTokens.length > 0 && { invalidTokens }),
      timestamp: new Date().toISOString()
    };

    return res.json(redemptionResult);

  } catch (error) {
    console.error('Error redeeming tokens:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to redeem offline tokens'
    });
  }
});

export default router;