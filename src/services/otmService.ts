import { randomBytes } from 'crypto';
import Web3 from 'web3';

export interface OfflineToken {
  tokenId: string;
  amount: string; // in wei as string to handle big numbers
  issuer: string; // OTM public key address
  issuedAt: number; // timestamp
  expiresAt: number; // timestamp
  signature: string; // cryptographic signature
  parentTokenId?: string; // for divided tokens
  nonce: number; // prevent replay attacks
}

export interface TokenExpirySettings {
  enabled: boolean;
  defaultExpiryHours: number;
  warningThresholdHours: number; // Hours before expiry to show warning
  allowExpiredRedemption: boolean;
  maxExpiredRedemptionHours: number; // Max hours after expiry to allow redemption
}

export interface TokenExpiryInfo {
  isExpired: boolean;
  isNearExpiry: boolean;
  hoursUntilExpiry: number;
  canBeRedeemed: boolean;
  expiryDate: Date;
}

export interface OTMKeyPair {
  address: string;
  privateKey: string;
  publicKey: string;
}

export class OTMService {
  private web3: Web3;
  private keyPair: OTMKeyPair | null = null;
  private nonceCounter: number = 0;
  private expirySettings: TokenExpirySettings;

  constructor(expirySettings?: Partial<TokenExpirySettings>) {
    this.web3 = new Web3();
    this.expirySettings = {
      enabled: true,
      defaultExpiryHours: 24,
      warningThresholdHours: 2,
      allowExpiredRedemption: true,
      maxExpiredRedemptionHours: 24,
      ...expirySettings
    };
  }

  /**
   * Generate a new cryptographic key pair for the OTM
   * Requirements: 1.1, 1.2, 5.1
   */
  generateKeyPair(): OTMKeyPair {
    const account = this.web3.eth.accounts.create();
    
    const keyPair: OTMKeyPair = {
      address: account.address,
      privateKey: account.privateKey,
      publicKey: account.address // In Ethereum, the address serves as the public key identifier
    };

    this.keyPair = keyPair;
    return keyPair;
  }

  /**
   * Set an existing key pair for the OTM
   */
  setKeyPair(keyPair: OTMKeyPair): void {
    this.keyPair = keyPair;
  }

  /**
   * Get the current key pair
   */
  getKeyPair(): OTMKeyPair | null {
    return this.keyPair;
  }

  /**
   * Generate a unique token ID
   */
  private generateTokenId(): string {
    const timestamp = Date.now().toString();
    const randomHex = randomBytes(16).toString('hex');
    return `${timestamp}-${randomHex}`;
  }

  /**
   * Get next nonce for preventing replay attacks
   */
  private getNextNonce(): number {
    return ++this.nonceCounter;
  }

  /**
   * Create the message to be signed for a token
   */
  private createTokenMessage(
    tokenId: string,
    amount: string,
    issuer: string,
    issuedAt: number,
    expiresAt: number,
    nonce: number,
    parentTokenId?: string
  ): string {
    const message = [
      tokenId,
      amount,
      issuer,
      issuedAt.toString(),
      expiresAt.toString(),
      nonce.toString(),
      parentTokenId || ''
    ].join('|');
    
    return message;
  }

  /**
   * Sign a token using the OTM private key
   * Requirements: 1.1, 5.1
   */
  private signToken(message: string): string {
    if (!this.keyPair) {
      throw new Error('OTM key pair not initialized. Call generateKeyPair() first.');
    }

    try {
      const messageHash = this.web3.utils.keccak256(message);
      const signature = this.web3.eth.accounts.sign(messageHash, this.keyPair.privateKey);
      return signature.signature;
    } catch (error) {
      throw new Error(`Failed to sign token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Issue a new offline token
   * Requirements: 1.1, 1.2, 5.1, 8.3
   */
  issueToken(
    amount: string,
    expiryHours: number = 24,
    parentTokenId?: string
  ): OfflineToken {
    if (!this.keyPair) {
      throw new Error('OTM key pair not initialized. Call generateKeyPair() first.');
    }

    // Validate amount
    if (!amount || amount === '0') {
      throw new Error('Token amount must be greater than 0');
    }

    // Validate amount is a valid number string
    try {
      const amountBN = this.web3.utils.toBigInt(amount);
      if (amountBN <= 0n) {
        throw new Error('Token amount must be greater than 0');
      }
    } catch (error) {
      throw new Error('Invalid token amount format');
    }

    const now = Date.now();
    const tokenId = this.generateTokenId();
    const issuedAt = Math.floor(now / 1000); // Unix timestamp in seconds
    const expiresAt = issuedAt + (expiryHours * 3600); // Add expiry hours
    const nonce = this.getNextNonce();

    // Create message to sign
    const message = this.createTokenMessage(
      tokenId,
      amount,
      this.keyPair.address,
      issuedAt,
      expiresAt,
      nonce,
      parentTokenId
    );

    // Sign the token
    const signature = this.signToken(message);

    const token: OfflineToken = {
      tokenId,
      amount,
      issuer: this.keyPair.address,
      issuedAt,
      expiresAt,
      signature,
      nonce,
      ...(parentTokenId && { parentTokenId })
    };

    return token;
  }

  /**
   * Verify a token signature
   * Requirements: 5.1, 5.4, 5.5
   */
  verifyTokenSignature(token: OfflineToken, issuerAddress?: string): boolean {
    try {
      const message = this.createTokenMessage(
        token.tokenId,
        token.amount,
        token.issuer,
        token.issuedAt,
        token.expiresAt,
        token.nonce,
        token.parentTokenId
      );

      const messageHash = this.web3.utils.keccak256(message);
      const recoveredAddress = this.web3.eth.accounts.recover(messageHash, token.signature);

      // If issuerAddress is provided, verify against it; otherwise use token.issuer
      const expectedIssuer = issuerAddress || token.issuer;
      return recoveredAddress.toLowerCase() === expectedIssuer.toLowerCase();
    } catch (error) {
      console.error('Token signature verification failed:', error);
      return false;
    }
  }

  /**
   * Check if a token has expired
   * Requirements: 8.3
   */
  isTokenExpired(token: OfflineToken): boolean {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    return currentTimestamp > token.expiresAt;
  }

  /**
   * Validate a token (signature and expiry)
   * Requirements: 5.1, 8.3
   */
  validateToken(token: OfflineToken, issuerAddress?: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check signature
    if (!this.verifyTokenSignature(token, issuerAddress)) {
      errors.push('Invalid token signature');
    }

    // Check expiry
    if (this.isTokenExpired(token)) {
      errors.push('Token has expired');
    }

    // Check amount
    try {
      const amountBN = this.web3.utils.toBigInt(token.amount);
      if (amountBN <= 0n) {
        errors.push('Invalid token amount');
      }
    } catch (error) {
      errors.push('Invalid token amount format');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get token information in a readable format
   */
  getTokenInfo(token: OfflineToken): {
    tokenId: string;
    amount: string;
    amountInEther: string;
    issuer: string;
    issuedAt: Date;
    expiresAt: Date;
    isExpired: boolean;
    parentTokenId?: string;
  } {
    return {
      tokenId: token.tokenId,
      amount: token.amount,
      amountInEther: this.web3.utils.fromWei(token.amount, 'ether'),
      issuer: token.issuer,
      issuedAt: new Date(token.issuedAt * 1000),
      expiresAt: new Date(token.expiresAt * 1000),
      isExpired: this.isTokenExpired(token),
      ...(token.parentTokenId && { parentTokenId: token.parentTokenId })
    };
  }

  /**
   * Get expiry settings
   * Requirements: 8.3
   */
  getExpirySettings(): TokenExpirySettings {
    return { ...this.expirySettings };
  }

  /**
   * Update expiry settings
   * Requirements: 8.3
   */
  updateExpirySettings(settings: Partial<TokenExpirySettings>): void {
    this.expirySettings = {
      ...this.expirySettings,
      ...settings
    };
  }

  /**
   * Get detailed expiry information for a token
   * Requirements: 8.4, 8.6
   */
  getTokenExpiryInfo(token: OfflineToken): TokenExpiryInfo {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const hoursUntilExpiry = (token.expiresAt - currentTimestamp) / 3600;
    const isExpired = currentTimestamp > token.expiresAt;
    const isNearExpiry = !isExpired && hoursUntilExpiry <= this.expirySettings.warningThresholdHours;
    
    // Check if expired token can still be redeemed
    const hoursSinceExpiry = isExpired ? (currentTimestamp - token.expiresAt) / 3600 : 0;
    const canBeRedeemed = !isExpired || 
      (this.expirySettings.allowExpiredRedemption && 
       hoursSinceExpiry <= this.expirySettings.maxExpiredRedemptionHours);

    return {
      isExpired,
      isNearExpiry,
      hoursUntilExpiry: Math.max(0, hoursUntilExpiry),
      canBeRedeemed,
      expiryDate: new Date(token.expiresAt * 1000)
    };
  }

  /**
   * Check if a token is approaching expiry and needs warning
   * Requirements: 8.4
   */
  isTokenNearExpiry(token: OfflineToken): boolean {
    const expiryInfo = this.getTokenExpiryInfo(token);
    return expiryInfo.isNearExpiry;
  }

  /**
   * Check if an expired token can still be redeemed
   * Requirements: 8.6
   */
  canExpiredTokenBeRedeemed(token: OfflineToken): boolean {
    const expiryInfo = this.getTokenExpiryInfo(token);
    return expiryInfo.canBeRedeemed;
  }

  /**
   * Refresh (renew) a token by creating a new one with the same amount
   * Requirements: 8.4
   */
  refreshToken(originalToken: OfflineToken, newExpiryHours?: number): OfflineToken {
    if (!this.keyPair) {
      throw new Error('OTM key pair not initialized. Call generateKeyPair() first.');
    }

    // Use provided expiry hours or default from settings
    const expiryHours = newExpiryHours || this.expirySettings.defaultExpiryHours;

    // Create a new token with the same amount but new expiry
    const refreshedToken = this.issueToken(
      originalToken.amount,
      expiryHours,
      originalToken.tokenId // Use original token ID as parent to track refresh chain
    );

    return refreshedToken;
  }

  /**
   * Batch refresh multiple tokens
   * Requirements: 8.4
   */
  refreshTokens(tokens: OfflineToken[], newExpiryHours?: number): OfflineToken[] {
    return tokens.map(token => this.refreshToken(token, newExpiryHours));
  }

  /**
   * Get tokens that need refresh (near expiry or expired but redeemable)
   * Requirements: 8.4, 8.6
   */
  getTokensNeedingRefresh(tokens: OfflineToken[]): {
    nearExpiry: OfflineToken[];
    expiredButRedeemable: OfflineToken[];
    expired: OfflineToken[];
  } {
    const nearExpiry: OfflineToken[] = [];
    const expiredButRedeemable: OfflineToken[] = [];
    const expired: OfflineToken[] = [];

    tokens.forEach(token => {
      const expiryInfo = this.getTokenExpiryInfo(token);
      
      if (expiryInfo.isExpired) {
        if (expiryInfo.canBeRedeemed) {
          expiredButRedeemable.push(token);
        } else {
          expired.push(token);
        }
      } else if (expiryInfo.isNearExpiry) {
        nearExpiry.push(token);
      }
    });

    return {
      nearExpiry,
      expiredButRedeemable,
      expired
    };
  }

  /**
   * Validate token with expiry considerations
   * Requirements: 8.3, 8.6
   */
  validateTokenWithExpiry(token: OfflineToken, issuerAddress?: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    expiryInfo: TokenExpiryInfo;
  } {
    const expiryInfo = this.getTokenExpiryInfo(token);
    const warnings: string[] = [];
    let errors: string[] = [];

    // Check signature first
    if (!this.verifyTokenSignature(token, issuerAddress)) {
      errors.push('Invalid token signature');
    }

    // Check amount
    try {
      const amountBN = this.web3.utils.toBigInt(token.amount);
      if (amountBN <= 0n) {
        errors.push('Invalid token amount');
      }
    } catch (error) {
      errors.push('Invalid token amount format');
    }

    // Handle expiry logic
    if (expiryInfo.isExpired) {
      if (expiryInfo.canBeRedeemed) {
        warnings.push('Token has expired but can still be redeemed');
      } else {
        errors.push('Token has expired');
      }
    } else if (expiryInfo.isNearExpiry) {
      warnings.push(`Token expires in ${expiryInfo.hoursUntilExpiry.toFixed(1)} hours`);
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      errors,
      warnings,
      expiryInfo
    };
  }

  /**
   * Get automatic caching recommendations based on current tokens
   * Requirements: 8.3, 8.4
   */
  getAutoCacheRecommendations(tokens: OfflineToken[]): {
    shouldRefresh: boolean;
    tokensToRefresh: OfflineToken[];
    recommendedAmount: string;
    recommendedExpiryHours: number;
  } {
    const needingRefresh = this.getTokensNeedingRefresh(tokens);
    const shouldRefresh = needingRefresh.nearExpiry.length > 0 || needingRefresh.expiredButRedeemable.length > 0;
    
    const tokensToRefresh = [...needingRefresh.nearExpiry, ...needingRefresh.expiredButRedeemable];
    
    // Calculate total amount that needs refreshing
    let totalAmount = 0n;
    tokensToRefresh.forEach(token => {
      totalAmount += this.web3.utils.toBigInt(token.amount);
    });

    return {
      shouldRefresh,
      tokensToRefresh,
      recommendedAmount: totalAmount.toString(),
      recommendedExpiryHours: this.expirySettings.defaultExpiryHours
    };
  }
}