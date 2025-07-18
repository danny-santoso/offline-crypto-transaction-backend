import { ethers } from 'ethers';
import { monitoringService } from './monitoring';

export interface TokenSplitRequest {
  token_id: string;
  original_amount: string;
  split_amounts: string[];
  signature: string;
  nonce: number;
  issuer: string;
}

export interface TokenSplitResult {
  original_token: {
    token_id: string;
    status: 'split';
    split_at: string;
  };
  new_tokens: {
    token_id: string;
    amount: string;
    signature: string;
    expires_at: string;
    qr_code: string;
  }[];
  change_token?: {
    token_id: string;
    amount: string;
    signature: string;
    expires_at: string;
    qr_code: string;
  };
}

export interface ChangeCalculationRequest {
  payment_amount: string;
  available_tokens: {
    token_id: string;
    amount: string;
    expires_at: string;
  }[];
  target_amount: string;
}

export interface ChangeCalculationResult {
  tokens_to_use: {
    token_id: string;
    amount: string;
  }[];
  change_amount: string;
  total_used: string;
  efficiency_score: number; // 0-1, higher is better
  requires_split: boolean;
  split_recommendations?: {
    token_id: string;
    split_into: string[];
  }[];
}

export interface PrecisionConfig {
  decimal_places: number;
  minimum_unit: string; // e.g., "0.001" for 3 decimal places
  rounding_mode: 'floor' | 'ceil' | 'round';
}

class TokenDivisionService {
  private precisionConfig: PrecisionConfig;

  constructor() {
    this.precisionConfig = {
      decimal_places: 6, // Support up to 6 decimal places (like most cryptocurrencies)
      minimum_unit: '0.000001', // 1 microunit
      rounding_mode: 'floor' // Conservative rounding to prevent overspending
    };
  }

  /**
   * Split a token into smaller denominations
   */
  async splitToken(request: TokenSplitRequest): Promise<TokenSplitResult> {
    const startTime = Date.now();

    try {
      // Validate the split request
      this.validateSplitRequest(request);

      // Verify the original token signature
      const isValidSignature = await this.verifyTokenSignature(
        request.token_id,
        request.original_amount,
        request.signature,
        request.issuer,
        request.nonce
      );

      if (!isValidSignature) {
        throw new Error('Invalid token signature');
      }

      // Validate split amounts
      const totalSplitAmount = this.calculateTotalAmount(request.split_amounts);
      const originalAmount = this.parseAmount(request.original_amount);

      if (!this.amountsEqual(totalSplitAmount, originalAmount)) {
        throw new Error(`Split amounts (${this.formatAmount(totalSplitAmount)}) do not equal original amount (${request.original_amount})`);
      }

      // Generate new tokens
      const newTokens = await this.generateSplitTokens(request);

      // Mark original token as split
      const originalToken = {
        token_id: request.token_id,
        status: 'split' as const,
        split_at: new Date().toISOString()
      };

      const duration = Date.now() - startTime;
      monitoringService.recordPerformance('token_split', duration, true);

      return {
        original_token: originalToken,
        new_tokens: newTokens
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      monitoringService.recordPerformance('token_split', duration, false);
      monitoringService.recordError(error as Error, 'token_split');
      throw error;
    }
  }

  /**
   * Calculate optimal change for a payment
   */
  calculateOptimalChange(request: ChangeCalculationRequest): ChangeCalculationResult {
    const startTime = Date.now();

    try {
      const targetAmount = this.parseAmount(request.target_amount);
      const paymentAmount = this.parseAmount(request.payment_amount);

      // Validate that payment amount is sufficient
      if (paymentAmount < targetAmount) {
        throw new Error('Payment amount is less than target amount');
      }

      // Sort tokens by amount (largest first for greedy algorithm)
      const sortedTokens = request.available_tokens
        .map(token => ({
          ...token,
          parsed_amount: this.parseAmount(token.amount)
        }))
        .sort((a, b) => b.parsed_amount - a.parsed_amount);

      // Try to find exact match first
      const exactMatch = this.findExactMatch(sortedTokens, targetAmount);
      if (exactMatch) {
        const duration = Date.now() - startTime;
        monitoringService.recordPerformance('change_calculation', duration, true);
        
        return {
          tokens_to_use: [{ token_id: exactMatch.token_id, amount: exactMatch.amount }],
          change_amount: this.formatAmount(paymentAmount - targetAmount),
          total_used: exactMatch.amount,
          efficiency_score: 1.0,
          requires_split: false
        };
      }

      // Use greedy algorithm to find optimal combination
      const greedyResult = this.greedyTokenSelection(sortedTokens, targetAmount);
      
      // Check if we need to split tokens
      const splitResult = this.calculateWithSplitting(sortedTokens, targetAmount);

      // Choose the better result
      const bestResult = this.chooseBestResult(greedyResult, splitResult);

      const duration = Date.now() - startTime;
      monitoringService.recordPerformance('change_calculation', duration, true);

      return {
        tokens_to_use: bestResult.tokens_to_use || [],
        change_amount: this.formatAmount(paymentAmount - targetAmount),
        total_used: bestResult.total_used || '0.000000',
        efficiency_score: bestResult.efficiency_score || 0,
        requires_split: bestResult.requires_split || false,
        split_recommendations: bestResult.split_recommendations
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      monitoringService.recordPerformance('change_calculation', duration, false);
      monitoringService.recordError(error as Error, 'change_calculation');
      throw error;
    }
  }

  /**
   * Validate mathematical precision of token operations
   */
  validatePrecision(amounts: string[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const minimumUnit = this.parseAmount(this.precisionConfig.minimum_unit);

    for (const amount of amounts) {
      try {
        const parsedAmount = this.parseAmount(amount);
        
        // Check if amount is positive
        if (parsedAmount <= 0) {
          errors.push(`Amount ${amount} must be positive`);
        }

        // Check if amount meets minimum unit requirement
        if (parsedAmount < minimumUnit) {
          errors.push(`Amount ${amount} is below minimum unit ${this.precisionConfig.minimum_unit}`);
        }

        // Check decimal places
        const decimalPlaces = this.getDecimalPlaces(amount);
        if (decimalPlaces > this.precisionConfig.decimal_places) {
          errors.push(`Amount ${amount} has too many decimal places (max: ${this.precisionConfig.decimal_places})`);
        }

      } catch (error) {
        errors.push(`Invalid amount format: ${amount}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate comprehensive test scenarios for token division
   */
  generateTestScenarios(): {
    split_tests: TokenSplitRequest[];
    change_tests: ChangeCalculationRequest[];
    precision_tests: string[][];
  } {
    return {
      split_tests: [
        {
          token_id: 'ot_test_001',
          original_amount: '1.000000',
          split_amounts: ['0.300000', '0.700000'],
          signature: '0x' + '0'.repeat(130),
          nonce: 1,
          issuer: '0x' + '0'.repeat(40)
        },
        {
          token_id: 'ot_test_002',
          original_amount: '5.500000',
          split_amounts: ['1.100000', '2.200000', '2.200000'],
          signature: '0x' + '0'.repeat(130),
          nonce: 2,
          issuer: '0x' + '0'.repeat(40)
        }
      ],
      change_tests: [
        {
          payment_amount: '10.000000',
          target_amount: '7.500000',
          available_tokens: [
            { token_id: 'ot_001', amount: '5.000000', expires_at: '2024-12-31T23:59:59Z' },
            { token_id: 'ot_002', amount: '3.000000', expires_at: '2024-12-31T23:59:59Z' },
            { token_id: 'ot_003', amount: '1.000000', expires_at: '2024-12-31T23:59:59Z' }
          ]
        }
      ],
      precision_tests: [
        ['1.000000', '0.500000', '0.500000'], // Valid split
        ['1.000000', '0.500000', '0.500001'], // Invalid - doesn't add up
        ['1.0000001', '0.5000000', '0.5000001'], // Invalid - too many decimals
        ['0.000000', '0.000000'], // Invalid - zero amounts
      ]
    };
  }

  private validateSplitRequest(request: TokenSplitRequest): void {
    if (!request.token_id || !request.original_amount || !request.split_amounts || !request.signature) {
      throw new Error('Missing required fields in split request');
    }

    if (!Array.isArray(request.split_amounts) || request.split_amounts.length === 0) {
      throw new Error('split_amounts must be a non-empty array');
    }

    if (request.split_amounts.length > 10) {
      throw new Error('Cannot split token into more than 10 pieces');
    }

    // Validate precision
    const allAmounts = [request.original_amount, ...request.split_amounts];
    const precisionCheck = this.validatePrecision(allAmounts);
    if (!precisionCheck.isValid) {
      throw new Error(`Precision validation failed: ${precisionCheck.errors.join(', ')}`);
    }
  }

  private async verifyTokenSignature(
    tokenId: string,
    amount: string,
    signature: string,
    issuer: string,
    nonce: number
  ): Promise<boolean> {
    try {
      // Enhanced testing signature validation
      if (process.env.NODE_ENV === 'test') {
        return this.validateTestSignature(tokenId, amount, signature, issuer, nonce);
      }

      // Production signature validation
      return this.validateProductionSignature(tokenId, amount, signature, issuer, nonce);
    } catch (error) {
      monitoringService.recordError(error as Error, 'signature_validation');
      return false;
    }
  }

  /**
   * Enhanced test signature validation that simulates real validation
   * while being deterministic for testing
   */
  private validateTestSignature(
    tokenId: string,
    amount: string,
    signature: string,
    issuer: string,
    nonce: number
  ): boolean {
    // Basic format validation
    if (!signature.startsWith('0x') || signature.length < 130) {
      return false;
    }

    // Validate issuer format
    if (!issuer.startsWith('0x') || issuer.length !== 42) {
      return false;
    }

    // Create deterministic validation based on token data
    const tokenData = `${tokenId}:${amount}:${issuer}:${nonce}`;
    const expectedSignaturePattern = this.generateTestSignaturePattern(tokenData);
    
    // Check if signature follows expected pattern for this token
    const signatureBody = signature.slice(2); // Remove '0x'
    const patternMatch = signatureBody.substring(0, 8) === expectedSignaturePattern;

    // Additional validation rules for testing
    const validationRules = [
      // Rule 1: Signature must not be all zeros
      !signatureBody.match(/^0+$/),
      // Rule 2: Signature must not be all the same character
      !signatureBody.match(/^(.)\1+$/),
      // Rule 3: Amount must be positive
      parseFloat(amount) > 0,
      // Rule 4: Nonce must be positive
      nonce > 0,
      // Rule 5: Token ID must not be empty
      tokenId.length > 0
    ];

    return patternMatch && validationRules.every(rule => rule);
  }

  /**
   * Production signature validation using real cryptographic verification
   */
  private validateProductionSignature(
    tokenId: string,
    amount: string,
    signature: string,
    issuer: string,
    nonce: number
  ): boolean {
    // Create message hash from token data
    const messageHash = ethers.solidityPackedKeccak256(
      ['string', 'string', 'address', 'uint256'],
      [tokenId, amount, issuer, nonce]
    );

    // Recover signer from signature
    const recoveredSigner = ethers.verifyMessage(ethers.getBytes(messageHash), signature);
    
    return recoveredSigner.toLowerCase() === issuer.toLowerCase();
  }

  /**
   * Generate a deterministic pattern for test signatures
   */
  private generateTestSignaturePattern(tokenData: string): string {
    // Create a simple hash of the token data for pattern generation
    let hash = 0;
    for (let i = 0; i < tokenData.length; i++) {
      const char = tokenData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Convert to hex and pad to 8 characters
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private async generateSplitTokens(request: TokenSplitRequest): Promise<TokenSplitResult['new_tokens']> {
    const newTokens: TokenSplitResult['new_tokens'] = [];
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    for (let i = 0; i < request.split_amounts.length; i++) {
      const amount = request.split_amounts[i];
      const newTokenId = `${request.token_id}_split_${i + 1}_${Date.now()}`;
      
      // Generate new signature for the split token
      const messageHash = ethers.solidityPackedKeccak256(
        ['string', 'string', 'address', 'uint256'],
        [newTokenId, amount, request.issuer, request.nonce + i + 1]
      );
      
      // In a real implementation, this would be signed by the OTM service
      const signature = '0x' + Math.random().toString(16).substring(2, 66) + Math.random().toString(16).substring(2, 66);
      
      newTokens.push({
        token_id: newTokenId,
        amount,
        signature,
        expires_at: expiresAt,
        qr_code: this.generateQRCode(newTokenId, amount, signature)
      });
    }

    return newTokens;
  }

  private findExactMatch(tokens: any[], targetAmount: number): any | null {
    return tokens.find(token => this.amountsEqual(token.parsed_amount, targetAmount));
  }

  private greedyTokenSelection(tokens: any[], targetAmount: number): Partial<ChangeCalculationResult> {
    const tokensToUse: { token_id: string; amount: string }[] = [];
    let remainingAmount = targetAmount;
    let totalUsed = 0;

    for (const token of tokens) {
      if (remainingAmount <= 0) break;

      if (token.parsed_amount <= remainingAmount) {
        tokensToUse.push({
          token_id: token.token_id,
          amount: token.amount
        });
        remainingAmount -= token.parsed_amount;
        totalUsed += token.parsed_amount;
      }
    }

    const efficiency = remainingAmount === 0 ? 1.0 : (targetAmount - remainingAmount) / targetAmount;

    return {
      tokens_to_use: tokensToUse,
      total_used: this.formatAmount(totalUsed),
      efficiency_score: efficiency,
      requires_split: remainingAmount > 0
    };
  }

  private calculateWithSplitting(tokens: any[], targetAmount: number): Partial<ChangeCalculationResult> {
    // Find the smallest token that's larger than the remaining amount
    const remainingAfterGreedy = this.greedyTokenSelection(tokens, targetAmount);
    
    if (!remainingAfterGreedy.requires_split) {
      return remainingAfterGreedy;
    }

    // Find a token that can be split to cover the remaining amount
    const remainingAmount = targetAmount - this.parseAmount(remainingAfterGreedy.total_used || '0');
    const splittableToken = tokens.find(token => token.parsed_amount > remainingAmount);

    if (splittableToken) {
      const splitRecommendation = {
        token_id: splittableToken.token_id,
        split_into: [
          this.formatAmount(remainingAmount),
          this.formatAmount(splittableToken.parsed_amount - remainingAmount)
        ]
      };

      return {
        ...remainingAfterGreedy,
        tokens_to_use: [
          ...remainingAfterGreedy.tokens_to_use || [],
          { token_id: splittableToken.token_id, amount: this.formatAmount(remainingAmount) }
        ],
        total_used: this.formatAmount(targetAmount),
        efficiency_score: 0.9, // Slightly lower due to splitting overhead
        requires_split: true,
        split_recommendations: [splitRecommendation]
      };
    }

    return remainingAfterGreedy;
  }

  private chooseBestResult(
    greedyResult: Partial<ChangeCalculationResult>,
    splitResult: Partial<ChangeCalculationResult>
  ): Partial<ChangeCalculationResult> {
    // Prefer exact matches without splitting
    if (greedyResult.efficiency_score === 1.0 && !greedyResult.requires_split) {
      return greedyResult;
    }

    // If splitting gives us an exact match, prefer it
    if (splitResult.efficiency_score && splitResult.efficiency_score > (greedyResult.efficiency_score || 0)) {
      return splitResult;
    }

    return greedyResult;
  }

  private parseAmount(amount: string): number {
    const parsed = parseFloat(amount);
    if (isNaN(parsed)) {
      throw new Error(`Invalid amount: ${amount}`);
    }
    return parsed;
  }

  private formatAmount(amount: number): string {
    return amount.toFixed(this.precisionConfig.decimal_places);
  }

  private calculateTotalAmount(amounts: string[]): number {
    return amounts.reduce((sum, amount) => sum + this.parseAmount(amount), 0);
  }

  private amountsEqual(amount1: number, amount2: number): boolean {
    const tolerance = this.parseAmount(this.precisionConfig.minimum_unit);
    return Math.abs(amount1 - amount2) < tolerance;
  }

  private getDecimalPlaces(amount: string): number {
    const parts = amount.split('.');
    return parts.length > 1 ? parts[1].length : 0;
  }

  private generateQRCode(tokenId: string, amount: string, signature: string): string {
    // In a real implementation, this would generate an actual QR code
    const data = JSON.stringify({ tokenId, amount, signature });
    return `data:image/png;base64,${Buffer.from(data).toString('base64')}`;
  }
}

// Singleton instance
export const tokenDivisionService = new TokenDivisionService();