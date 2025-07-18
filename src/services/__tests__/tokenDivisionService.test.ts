import { tokenDivisionService, TokenSplitRequest, ChangeCalculationRequest } from '../tokenDivisionService';

// Helper function to generate valid test signatures
function generateValidTestSignature(tokenId: string, amount: string, issuer: string, nonce: number): string {
  const tokenData = `${tokenId}:${amount}:${issuer}:${nonce}`;
  let hash = 0;
  for (let i = 0; i < tokenData.length; i++) {
    const char = tokenData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const pattern = Math.abs(hash).toString(16).padStart(8, '0');
  return '0x' + pattern + Math.random().toString(16).substring(2, 66) + Math.random().toString(16).substring(2, 66);
}

describe('TokenDivisionService', () => {
  describe('Token Splitting', () => {
    test('should split token into equal parts', async () => {
      const request: TokenSplitRequest = {
        token_id: 'ot_test_001',
        original_amount: '1.000000',
        split_amounts: ['0.500000', '0.500000'],
        signature: generateValidTestSignature('ot_test_001', '1.000000', '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4', 1),
        nonce: 1,
        issuer: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4'
      };

      const result = await tokenDivisionService.splitToken(request);

      expect(result.original_token.token_id).toBe(request.token_id);
      expect(result.original_token.status).toBe('split');
      expect(result.new_tokens).toHaveLength(2);
      expect(result.new_tokens[0].amount).toBe('0.500000');
      expect(result.new_tokens[1].amount).toBe('0.500000');
      expect(result.new_tokens[0].token_id).toContain('split_1');
      expect(result.new_tokens[1].token_id).toContain('split_2');
    });

    test('should split token into unequal parts', async () => {
      const request: TokenSplitRequest = {
        token_id: 'ot_test_002',
        original_amount: '5.500000',
        split_amounts: ['1.100000', '2.200000', '2.200000'],
        signature: generateValidTestSignature('ot_test_002', '5.500000', '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4', 2),
        nonce: 2,
        issuer: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4'
      };

      const result = await tokenDivisionService.splitToken(request);

      expect(result.new_tokens).toHaveLength(3);
      expect(result.new_tokens[0].amount).toBe('1.100000');
      expect(result.new_tokens[1].amount).toBe('2.200000');
      expect(result.new_tokens[2].amount).toBe('2.200000');
    });

    test('should reject split with mismatched amounts', async () => {
      const request: TokenSplitRequest = {
        token_id: 'ot_test_003',
        original_amount: '1.000000',
        split_amounts: ['0.500000', '0.600000'], // Total: 1.1, not 1.0
        signature: generateValidTestSignature('ot_test_003', '1.000000', '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4', 3),
        nonce: 3,
        issuer: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4'
      };

      await expect(tokenDivisionService.splitToken(request)).rejects.toThrow('do not equal original amount');
    });

    test('should reject split with too many pieces', async () => {
      const request: TokenSplitRequest = {
        token_id: 'ot_test_004',
        original_amount: '11.000000',
        split_amounts: Array(11).fill('1.000000'), // 11 pieces, max is 10
        signature: generateValidTestSignature('ot_test_004', '11.000000', '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4', 4),
        nonce: 4,
        issuer: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4'
      };

      await expect(tokenDivisionService.splitToken(request)).rejects.toThrow('Cannot split token into more than 10 pieces');
    });

    test('should reject split with invalid precision', async () => {
      const request: TokenSplitRequest = {
        token_id: 'ot_test_005',
        original_amount: '1.0000000', // 7 decimal places, max is 6
        split_amounts: ['0.5000000', '0.5000000'],
        signature: '0x' + '5'.repeat(130),
        nonce: 5,
        issuer: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4'
      };

      await expect(tokenDivisionService.splitToken(request)).rejects.toThrow('too many decimal places');
    });
  });

  describe('Change Calculation', () => {
    test('should find exact match for payment', () => {
      const request: ChangeCalculationRequest = {
        payment_amount: '10.000000',
        target_amount: '5.000000',
        available_tokens: [
          { token_id: 'ot_001', amount: '5.000000', expires_at: '2024-12-31T23:59:59Z' },
          { token_id: 'ot_002', amount: '3.000000', expires_at: '2024-12-31T23:59:59Z' },
          { token_id: 'ot_003', amount: '1.000000', expires_at: '2024-12-31T23:59:59Z' }
        ]
      };

      const result = tokenDivisionService.calculateOptimalChange(request);

      expect(result.tokens_to_use).toHaveLength(1);
      expect(result.tokens_to_use[0].token_id).toBe('ot_001');
      expect(result.tokens_to_use[0].amount).toBe('5.000000');
      expect(result.change_amount).toBe('5.000000');
      expect(result.efficiency_score).toBe(1.0);
      expect(result.requires_split).toBe(false);
    });

    test('should use greedy algorithm for optimal combination', () => {
      const request: ChangeCalculationRequest = {
        payment_amount: '10.000000',
        target_amount: '7.500000',
        available_tokens: [
          { token_id: 'ot_001', amount: '5.000000', expires_at: '2024-12-31T23:59:59Z' },
          { token_id: 'ot_002', amount: '3.000000', expires_at: '2024-12-31T23:59:59Z' },
          { token_id: 'ot_003', amount: '1.000000', expires_at: '2024-12-31T23:59:59Z' },
          { token_id: 'ot_004', amount: '0.500000', expires_at: '2024-12-31T23:59:59Z' }
        ]
      };

      const result = tokenDivisionService.calculateOptimalChange(request);

      expect(result.tokens_to_use).toHaveLength(3);
      expect(result.total_used).toBe('7.500000');
      expect(result.change_amount).toBe('2.500000');
      expect(result.efficiency_score).toBe(1.0);
      expect(result.requires_split).toBe(false);
    });

    test('should recommend token splitting when needed', () => {
      const request: ChangeCalculationRequest = {
        payment_amount: '10.000000',
        target_amount: '6.500000',
        available_tokens: [
          { token_id: 'ot_001', amount: '5.000000', expires_at: '2024-12-31T23:59:59Z' },
          { token_id: 'ot_002', amount: '3.000000', expires_at: '2024-12-31T23:59:59Z' }
        ]
      };

      const result = tokenDivisionService.calculateOptimalChange(request);

      expect(result.requires_split).toBe(true);
      expect(result.split_recommendations).toBeDefined();
      expect(result.split_recommendations).toHaveLength(1);
      expect(result.split_recommendations![0].token_id).toBe('ot_002');
      expect(result.split_recommendations![0].split_into).toContain('1.500000');
      expect(result.split_recommendations![0].split_into).toContain('1.500000');
    });

    test('should handle insufficient tokens', () => {
      const request: ChangeCalculationRequest = {
        payment_amount: '10.000000',
        target_amount: '8.000000',
        available_tokens: [
          { token_id: 'ot_001', amount: '3.000000', expires_at: '2024-12-31T23:59:59Z' },
          { token_id: 'ot_002', amount: '2.000000', expires_at: '2024-12-31T23:59:59Z' }
        ]
      };

      const result = tokenDivisionService.calculateOptimalChange(request);

      expect(result.efficiency_score).toBeLessThan(1.0);
      expect(result.requires_split).toBe(true);
      expect(parseFloat(result.total_used)).toBeLessThan(8.0);
    });

    test('should reject payment amount less than target', () => {
      const request: ChangeCalculationRequest = {
        payment_amount: '5.000000',
        target_amount: '10.000000', // More than payment
        available_tokens: [
          { token_id: 'ot_001', amount: '3.000000', expires_at: '2024-12-31T23:59:59Z' }
        ]
      };

      expect(() => tokenDivisionService.calculateOptimalChange(request))
        .toThrow('Payment amount is less than target amount');
    });
  });

  describe('Precision Validation', () => {
    test('should validate correct precision', () => {
      const amounts = ['1.000000', '0.500000', '0.000001'];
      const result = tokenDivisionService.validatePrecision(amounts);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject amounts with too many decimal places', () => {
      const amounts = ['1.0000000']; // 7 decimal places, max is 6
      const result = tokenDivisionService.validatePrecision(amounts);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Amount 1.0000000 has too many decimal places (max: 6)');
    });

    test('should reject zero amounts', () => {
      const amounts = ['0.000000'];
      const result = tokenDivisionService.validatePrecision(amounts);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Amount 0.000000 must be positive');
    });

    test('should reject amounts below minimum unit', () => {
      const amounts = ['0.0000001']; // Below minimum unit of 0.000001
      const result = tokenDivisionService.validatePrecision(amounts);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Amount 0.0000001 has too many decimal places (max: 6)');
    });

    test('should reject invalid amount formats', () => {
      const amounts = ['invalid', 'abc', ''];
      const result = tokenDivisionService.validatePrecision(amounts);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors[0]).toContain('Invalid amount format: invalid');
    });
  });

  describe('Test Scenario Generation', () => {
    test('should generate comprehensive test scenarios', () => {
      const scenarios = tokenDivisionService.generateTestScenarios();

      expect(scenarios.split_tests).toHaveLength(2);
      expect(scenarios.change_tests).toHaveLength(1);
      expect(scenarios.precision_tests).toHaveLength(4);

      // Validate split test structure
      const splitTest = scenarios.split_tests[0];
      expect(splitTest).toHaveProperty('token_id');
      expect(splitTest).toHaveProperty('original_amount');
      expect(splitTest).toHaveProperty('split_amounts');
      expect(splitTest).toHaveProperty('signature');
      expect(splitTest).toHaveProperty('nonce');
      expect(splitTest).toHaveProperty('issuer');

      // Validate change test structure
      const changeTest = scenarios.change_tests[0];
      expect(changeTest).toHaveProperty('payment_amount');
      expect(changeTest).toHaveProperty('target_amount');
      expect(changeTest).toHaveProperty('available_tokens');
      expect(Array.isArray(changeTest.available_tokens)).toBe(true);

      // Validate precision test structure
      expect(Array.isArray(scenarios.precision_tests[0])).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle very small amounts', async () => {
      const request: TokenSplitRequest = {
        token_id: 'ot_small',
        original_amount: '0.000002',
        split_amounts: ['0.000001', '0.000001'],
        signature: '0x' + 'a'.repeat(130),
        nonce: 1,
        issuer: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4'
      };

      const result = await tokenDivisionService.splitToken(request);
      expect(result.new_tokens).toHaveLength(2);
      expect(result.new_tokens[0].amount).toBe('0.000001');
    });

    test('should handle maximum precision amounts', async () => {
      const request: TokenSplitRequest = {
        token_id: 'ot_max_precision',
        original_amount: '999999.999999',
        split_amounts: ['500000.000000', '499999.999999'],
        signature: '0x' + 'b'.repeat(130),
        nonce: 1,
        issuer: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4'
      };

      const result = await tokenDivisionService.splitToken(request);
      expect(result.new_tokens).toHaveLength(2);
    });

    test('should handle single token split', async () => {
      const request: TokenSplitRequest = {
        token_id: 'ot_single',
        original_amount: '1.000000',
        split_amounts: ['1.000000'], // Split into one piece (essentially no split)
        signature: '0x' + 'c'.repeat(130),
        nonce: 1,
        issuer: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4'
      };

      const result = await tokenDivisionService.splitToken(request);
      expect(result.new_tokens).toHaveLength(1);
      expect(result.new_tokens[0].amount).toBe('1.000000');
    });

    test('should handle empty token list in change calculation', () => {
      const request: ChangeCalculationRequest = {
        payment_amount: '10.000000',
        target_amount: '5.000000',
        available_tokens: []
      };

      const result = tokenDivisionService.calculateOptimalChange(request);
      expect(result.tokens_to_use).toHaveLength(0);
      expect(result.efficiency_score).toBe(0);
      expect(result.requires_split).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    test('should handle large number of tokens efficiently', () => {
      const startTime = Date.now();
      
      // Generate 100 tokens
      const tokens = Array.from({ length: 100 }, (_, i) => ({
        token_id: `ot_${i}`,
        amount: (Math.random() * 10).toFixed(6),
        expires_at: '2024-12-31T23:59:59Z'
      }));

      const request: ChangeCalculationRequest = {
        payment_amount: '100.000000',
        target_amount: '50.000000',
        available_tokens: tokens
      };

      const result = tokenDivisionService.calculateOptimalChange(request);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(result).toBeDefined();
    });

    test('should handle complex split scenarios efficiently', async () => {
      const startTime = Date.now();

      const request: TokenSplitRequest = {
        token_id: 'ot_complex',
        original_amount: '10.000000',
        split_amounts: Array.from({ length: 10 }, () => '1.000000'), // Split into 10 pieces
        signature: '0x' + 'd'.repeat(130),
        nonce: 1,
        issuer: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4'
      };

      const result = await tokenDivisionService.splitToken(request);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500); // Should complete within 500ms
      expect(result.new_tokens).toHaveLength(10);
    });
  });
});