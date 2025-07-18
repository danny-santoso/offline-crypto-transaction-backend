import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { OTMService, OfflineToken, OTMKeyPair, TokenExpirySettings, TokenExpiryInfo } from '../otmService';
import Web3 from 'web3';

describe('OTMService', () => {
  let otmService: OTMService;
  let web3: Web3;

  beforeEach(() => {
    otmService = new OTMService();
    web3 = new Web3();
  });

  describe('Key Pair Management', () => {
    test('should generate a valid key pair', () => {
      const keyPair = otmService.generateKeyPair();

      assert.ok(keyPair);
      assert.match(keyPair.address, /^0x[a-fA-F0-9]{40}$/);
      assert.match(keyPair.privateKey, /^0x[a-fA-F0-9]{64}$/);
      assert.strictEqual(keyPair.publicKey, keyPair.address);
    });

    test('should set and get key pair', () => {
      const mockKeyPair: OTMKeyPair = {
        address: '0x1234567890123456789012345678901234567890',
        privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
        publicKey: '0x1234567890123456789012345678901234567890'
      };

      otmService.setKeyPair(mockKeyPair);
      const retrievedKeyPair = otmService.getKeyPair();

      assert.deepStrictEqual(retrievedKeyPair, mockKeyPair);
    });

    test('should return null when no key pair is set', () => {
      const keyPair = otmService.getKeyPair();
      assert.strictEqual(keyPair, null);
    });
  });

  describe('Token Issuance', () => {
    beforeEach(() => {
      otmService.generateKeyPair();
    });

    test('should issue a valid token with default expiry', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount);

      assert.ok(token);
      assert.match(token.tokenId, /^\d+-[a-f0-9]{32}$/);
      assert.strictEqual(token.amount, amount);
      assert.strictEqual(token.issuer, otmService.getKeyPair()!.address);
      assert.match(token.signature, /^0x[a-fA-F0-9]{130}$/);
      assert.ok(token.nonce > 0);
      assert.ok(token.issuedAt > 0);
      assert.ok(token.expiresAt > token.issuedAt);
      assert.strictEqual(token.parentTokenId, undefined);
    });

    test('should issue token with custom expiry hours', () => {
      const amount = web3.utils.toWei('0.5', 'ether');
      const expiryHours = 48;
      const token = otmService.issueToken(amount, expiryHours);

      const expectedExpiryTime = token.issuedAt + (expiryHours * 3600);
      assert.strictEqual(token.expiresAt, expectedExpiryTime);
    });

    test('should issue token with parent token ID', () => {
      const amount = web3.utils.toWei('0.25', 'ether');
      const parentTokenId = 'parent-token-123';
      const token = otmService.issueToken(amount, 24, parentTokenId);

      assert.strictEqual(token.parentTokenId, parentTokenId);
    });

    test('should throw error when issuing token without key pair', () => {
      const newOtmService = new OTMService();
      const amount = web3.utils.toWei('1', 'ether');

      assert.throws(() => {
        newOtmService.issueToken(amount);
      }, /OTM key pair not initialized/);
    });

    test('should throw error for zero amount', () => {
      assert.throws(() => {
        otmService.issueToken('0');
      }, /Token amount must be greater than 0/);
    });

    test('should throw error for empty amount', () => {
      assert.throws(() => {
        otmService.issueToken('');
      }, /Token amount must be greater than 0/);
    });

    test('should throw error for invalid amount format', () => {
      assert.throws(() => {
        otmService.issueToken('invalid-amount');
      }, /Invalid token amount format/);
    });

    test('should generate unique token IDs', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token1 = otmService.issueToken(amount);
      const token2 = otmService.issueToken(amount);

      assert.notStrictEqual(token1.tokenId, token2.tokenId);
    });

    test('should increment nonce for each token', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token1 = otmService.issueToken(amount);
      const token2 = otmService.issueToken(amount);

      assert.strictEqual(token2.nonce, token1.nonce + 1);
    });
  });

  describe('Token Signature Verification', () => {
    let keyPair: OTMKeyPair;
    let token: OfflineToken;

    beforeEach(() => {
      keyPair = otmService.generateKeyPair();
      const amount = web3.utils.toWei('1', 'ether');
      token = otmService.issueToken(amount);
    });

    test('should verify valid token signature', () => {
      const isValid = otmService.verifyTokenSignature(token);
      assert.strictEqual(isValid, true);
    });

    test('should verify token signature with explicit issuer address', () => {
      const isValid = otmService.verifyTokenSignature(token, keyPair.address);
      assert.strictEqual(isValid, true);
    });

    test('should reject token with invalid signature', () => {
      const invalidToken = { ...token, signature: '0x' + '0'.repeat(130) };
      const isValid = otmService.verifyTokenSignature(invalidToken);
      assert.strictEqual(isValid, false);
    });

    test('should reject token with wrong issuer', () => {
      const wrongIssuer = '0x' + '1'.repeat(40);
      const isValid = otmService.verifyTokenSignature(token, wrongIssuer);
      assert.strictEqual(isValid, false);
    });

    test('should reject token with tampered amount', () => {
      const tamperedToken = { ...token, amount: web3.utils.toWei('2', 'ether') };
      const isValid = otmService.verifyTokenSignature(tamperedToken);
      assert.strictEqual(isValid, false);
    });

    test('should reject token with tampered expiry', () => {
      const tamperedToken = { ...token, expiresAt: token.expiresAt + 3600 };
      const isValid = otmService.verifyTokenSignature(tamperedToken);
      assert.strictEqual(isValid, false);
    });
  });

  describe('Token Expiry Management', () => {
    beforeEach(() => {
      otmService.generateKeyPair();
    });

    test('should detect non-expired token', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 24); // 24 hours from now

      const isExpired = otmService.isTokenExpired(token);
      assert.strictEqual(isExpired, false);
    });

    test('should detect expired token', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 1); // 1 hour from now
      
      // Manually set expiry to past
      token.expiresAt = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      const isExpired = otmService.isTokenExpired(token);
      assert.strictEqual(isExpired, true);
    });
  });

  describe('Token Validation', () => {
    let token: OfflineToken;

    beforeEach(() => {
      otmService.generateKeyPair();
      const amount = web3.utils.toWei('1', 'ether');
      token = otmService.issueToken(amount);
    });

    test('should validate a valid token', () => {
      const validation = otmService.validateToken(token);

      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    test('should detect invalid signature', () => {
      const invalidToken = { ...token, signature: '0x' + '0'.repeat(130) };
      const validation = otmService.validateToken(invalidToken);

      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.includes('Invalid token signature'));
    });

    test('should detect expired token', () => {
      const expiredToken = { ...token, expiresAt: Math.floor(Date.now() / 1000) - 3600 };
      const validation = otmService.validateToken(expiredToken);

      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.includes('Token has expired'));
    });

    test('should detect invalid amount', () => {
      const invalidToken = { ...token, amount: '0' };
      const validation = otmService.validateToken(invalidToken);

      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.includes('Invalid token amount'));
    });

    test('should detect multiple errors', () => {
      const invalidToken = {
        ...token,
        signature: '0x' + '0'.repeat(130),
        expiresAt: Math.floor(Date.now() / 1000) - 3600,
        amount: '0'
      };
      const validation = otmService.validateToken(invalidToken);

      assert.strictEqual(validation.isValid, false);
      assert.strictEqual(validation.errors.length, 3);
      assert.ok(validation.errors.includes('Invalid token signature'));
      assert.ok(validation.errors.includes('Token has expired'));
      assert.ok(validation.errors.includes('Invalid token amount'));
    });
  });

  describe('Token Information', () => {
    let token: OfflineToken;

    beforeEach(() => {
      otmService.generateKeyPair();
      const amount = web3.utils.toWei('1.5', 'ether');
      token = otmService.issueToken(amount);
    });

    test('should provide readable token information', () => {
      const info = otmService.getTokenInfo(token);

      assert.strictEqual(info.tokenId, token.tokenId);
      assert.strictEqual(info.amount, token.amount);
      assert.strictEqual(info.amountInEther, '1.5');
      assert.strictEqual(info.issuer, token.issuer);
      assert.ok(info.issuedAt instanceof Date);
      assert.ok(info.expiresAt instanceof Date);
      assert.strictEqual(info.isExpired, false);
      assert.strictEqual(info.parentTokenId, undefined);
    });

    test('should include parent token ID when present', () => {
      const parentTokenId = 'parent-123';
      const childToken = otmService.issueToken(web3.utils.toWei('0.5', 'ether'), 24, parentTokenId);
      const info = otmService.getTokenInfo(childToken);

      assert.strictEqual(info.parentTokenId, parentTokenId);
    });

    test('should correctly identify expired token', () => {
      const expiredToken = { ...token, expiresAt: Math.floor(Date.now() / 1000) - 3600 };
      const info = otmService.getTokenInfo(expiredToken);

      assert.strictEqual(info.isExpired, true);
    });
  });

  describe('Integration Tests', () => {
    beforeEach(() => {
      otmService.generateKeyPair();
    });

    test('should create and verify multiple tokens from same issuer', () => {
      const keyPair = otmService.getKeyPair()!;
      const amounts = ['1', '0.5', '2.5'].map(eth => web3.utils.toWei(eth, 'ether'));
      
      const tokens = amounts.map(amount => otmService.issueToken(amount));

      // All tokens should be valid
      tokens.forEach(token => {
        assert.strictEqual(otmService.verifyTokenSignature(token), true);
        assert.strictEqual(otmService.validateToken(token).isValid, true);
        assert.strictEqual(token.issuer, keyPair.address);
      });

      // All tokens should have unique IDs and incrementing nonces
      const tokenIds = tokens.map(t => t.tokenId);
      const uniqueIds = new Set(tokenIds);
      assert.strictEqual(uniqueIds.size, tokens.length);

      for (let i = 1; i < tokens.length; i++) {
        assert.strictEqual(tokens[i].nonce, tokens[i - 1].nonce + 1);
      }
    });

    test('should handle token division scenario', () => {
      const parentAmount = web3.utils.toWei('1', 'ether');
      const parentToken = otmService.issueToken(parentAmount);

      // Create child tokens representing division
      const childAmount1 = web3.utils.toWei('0.7', 'ether');
      const childAmount2 = web3.utils.toWei('0.3', 'ether');
      
      const childToken1 = otmService.issueToken(childAmount1, 24, parentToken.tokenId);
      const childToken2 = otmService.issueToken(childAmount2, 24, parentToken.tokenId);

      // Verify all tokens
      assert.strictEqual(otmService.validateToken(parentToken).isValid, true);
      assert.strictEqual(otmService.validateToken(childToken1).isValid, true);
      assert.strictEqual(otmService.validateToken(childToken2).isValid, true);

      // Verify parent-child relationship
      assert.strictEqual(childToken1.parentTokenId, parentToken.tokenId);
      assert.strictEqual(childToken2.parentTokenId, parentToken.tokenId);

      // Verify amounts add up (in practice, this would be enforced by business logic)
      const parentAmountBN = web3.utils.toBigInt(parentAmount);
      const childSum = web3.utils.toBigInt(childAmount1) + web3.utils.toBigInt(childAmount2);
      assert.strictEqual(childSum, parentAmountBN);
    });
  });

  describe('Token Expiry Settings Management', () => {
    test('should initialize with default expiry settings', () => {
      const settings = otmService.getExpirySettings();

      assert.strictEqual(settings.enabled, true);
      assert.strictEqual(settings.defaultExpiryHours, 24);
      assert.strictEqual(settings.warningThresholdHours, 2);
      assert.strictEqual(settings.allowExpiredRedemption, true);
      assert.strictEqual(settings.maxExpiredRedemptionHours, 24);
    });

    test('should initialize with custom expiry settings', () => {
      const customSettings: Partial<TokenExpirySettings> = {
        defaultExpiryHours: 48,
        warningThresholdHours: 4,
        allowExpiredRedemption: false
      };
      const customOtmService = new OTMService(customSettings);
      const settings = customOtmService.getExpirySettings();

      assert.strictEqual(settings.defaultExpiryHours, 48);
      assert.strictEqual(settings.warningThresholdHours, 4);
      assert.strictEqual(settings.allowExpiredRedemption, false);
      // Should keep defaults for unspecified settings
      assert.strictEqual(settings.enabled, true);
      assert.strictEqual(settings.maxExpiredRedemptionHours, 24);
    });

    test('should update expiry settings', () => {
      const newSettings: Partial<TokenExpirySettings> = {
        defaultExpiryHours: 72,
        warningThresholdHours: 6
      };

      otmService.updateExpirySettings(newSettings);
      const settings = otmService.getExpirySettings();

      assert.strictEqual(settings.defaultExpiryHours, 72);
      assert.strictEqual(settings.warningThresholdHours, 6);
      // Should keep existing values for unspecified settings
      assert.strictEqual(settings.enabled, true);
      assert.strictEqual(settings.allowExpiredRedemption, true);
    });
  });

  describe('Token Expiry Information', () => {
    beforeEach(() => {
      otmService.generateKeyPair();
    });

    test('should provide detailed expiry info for non-expired token', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 24); // 24 hours from now

      const expiryInfo = otmService.getTokenExpiryInfo(token);

      assert.strictEqual(expiryInfo.isExpired, false);
      assert.strictEqual(expiryInfo.isNearExpiry, false);
      assert.ok(expiryInfo.hoursUntilExpiry > 23);
      assert.ok(expiryInfo.hoursUntilExpiry <= 24);
      assert.strictEqual(expiryInfo.canBeRedeemed, true);
      assert.ok(expiryInfo.expiryDate instanceof Date);
    });

    test('should detect token near expiry', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 1); // 1 hour from now

      const expiryInfo = otmService.getTokenExpiryInfo(token);

      assert.strictEqual(expiryInfo.isExpired, false);
      assert.strictEqual(expiryInfo.isNearExpiry, true);
      assert.ok(expiryInfo.hoursUntilExpiry <= 1);
      assert.strictEqual(expiryInfo.canBeRedeemed, true);
    });

    test('should detect expired token that can be redeemed', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 1);
      
      // Manually set expiry to 1 hour ago (within redemption window)
      token.expiresAt = Math.floor(Date.now() / 1000) - 3600;

      const expiryInfo = otmService.getTokenExpiryInfo(token);

      assert.strictEqual(expiryInfo.isExpired, true);
      assert.strictEqual(expiryInfo.isNearExpiry, false);
      assert.strictEqual(expiryInfo.hoursUntilExpiry, 0);
      assert.strictEqual(expiryInfo.canBeRedeemed, true);
    });

    test('should detect expired token that cannot be redeemed', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 1);
      
      // Manually set expiry to 25 hours ago (outside redemption window)
      token.expiresAt = Math.floor(Date.now() / 1000) - (25 * 3600);

      const expiryInfo = otmService.getTokenExpiryInfo(token);

      assert.strictEqual(expiryInfo.isExpired, true);
      assert.strictEqual(expiryInfo.isNearExpiry, false);
      assert.strictEqual(expiryInfo.hoursUntilExpiry, 0);
      assert.strictEqual(expiryInfo.canBeRedeemed, false);
    });

    test('should respect custom redemption window settings', () => {
      const customSettings: Partial<TokenExpirySettings> = {
        maxExpiredRedemptionHours: 48
      };
      const customOtmService = new OTMService(customSettings);
      customOtmService.generateKeyPair();

      const amount = web3.utils.toWei('1', 'ether');
      const token = customOtmService.issueToken(amount, 1);
      
      // Set expiry to 30 hours ago (within custom 48-hour window)
      token.expiresAt = Math.floor(Date.now() / 1000) - (30 * 3600);

      const expiryInfo = customOtmService.getTokenExpiryInfo(token);

      assert.strictEqual(expiryInfo.isExpired, true);
      assert.strictEqual(expiryInfo.canBeRedeemed, true);
    });
  });

  describe('Token Near Expiry Detection', () => {
    beforeEach(() => {
      otmService.generateKeyPair();
    });

    test('should detect token near expiry', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 1); // 1 hour from now

      const isNearExpiry = otmService.isTokenNearExpiry(token);
      assert.strictEqual(isNearExpiry, true);
    });

    test('should not detect non-near-expiry token', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 24); // 24 hours from now

      const isNearExpiry = otmService.isTokenNearExpiry(token);
      assert.strictEqual(isNearExpiry, false);
    });

    test('should respect custom warning threshold', () => {
      const customSettings: Partial<TokenExpirySettings> = {
        warningThresholdHours: 6
      };
      const customOtmService = new OTMService(customSettings);
      customOtmService.generateKeyPair();

      const amount = web3.utils.toWei('1', 'ether');
      const token = customOtmService.issueToken(amount, 4); // 4 hours from now

      const isNearExpiry = customOtmService.isTokenNearExpiry(token);
      assert.strictEqual(isNearExpiry, true);
    });
  });

  describe('Expired Token Redemption Check', () => {
    beforeEach(() => {
      otmService.generateKeyPair();
    });

    test('should allow redemption of recently expired token', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 1);
      
      // Set expiry to 1 hour ago
      token.expiresAt = Math.floor(Date.now() / 1000) - 3600;

      const canRedeem = otmService.canExpiredTokenBeRedeemed(token);
      assert.strictEqual(canRedeem, true);
    });

    test('should not allow redemption of long-expired token', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 1);
      
      // Set expiry to 25 hours ago
      token.expiresAt = Math.floor(Date.now() / 1000) - (25 * 3600);

      const canRedeem = otmService.canExpiredTokenBeRedeemed(token);
      assert.strictEqual(canRedeem, false);
    });

    test('should allow redemption of non-expired token', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 24);

      const canRedeem = otmService.canExpiredTokenBeRedeemed(token);
      assert.strictEqual(canRedeem, true);
    });
  });

  describe('Token Refresh Functionality', () => {
    beforeEach(() => {
      otmService.generateKeyPair();
    });

    test('should refresh a token with default expiry', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const originalToken = otmService.issueToken(amount, 1);

      const refreshedToken = otmService.refreshToken(originalToken);

      assert.strictEqual(refreshedToken.amount, originalToken.amount);
      assert.strictEqual(refreshedToken.issuer, originalToken.issuer);
      assert.notStrictEqual(refreshedToken.tokenId, originalToken.tokenId);
      assert.strictEqual(refreshedToken.parentTokenId, originalToken.tokenId);
      assert.ok(refreshedToken.expiresAt > originalToken.expiresAt);
      assert.ok(otmService.verifyTokenSignature(refreshedToken));
    });

    test('should refresh a token with custom expiry', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const originalToken = otmService.issueToken(amount, 1);
      const customExpiryHours = 48;

      const refreshedToken = otmService.refreshToken(originalToken, customExpiryHours);

      const expectedExpiryTime = refreshedToken.issuedAt + (customExpiryHours * 3600);
      assert.strictEqual(refreshedToken.expiresAt, expectedExpiryTime);
    });

    test('should throw error when refreshing without key pair', () => {
      const newOtmService = new OTMService();
      const amount = web3.utils.toWei('1', 'ether');
      
      // Create a mock token
      const mockToken: OfflineToken = {
        tokenId: 'test-token',
        amount,
        issuer: '0x1234567890123456789012345678901234567890',
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        signature: '0x' + '0'.repeat(130),
        nonce: 1
      };

      assert.throws(() => {
        newOtmService.refreshToken(mockToken);
      }, /OTM key pair not initialized/);
    });

    test('should batch refresh multiple tokens', () => {
      const amounts = ['1', '0.5', '2'].map(eth => web3.utils.toWei(eth, 'ether'));
      const originalTokens = amounts.map(amount => otmService.issueToken(amount, 1));

      const refreshedTokens = otmService.refreshTokens(originalTokens, 48);

      assert.strictEqual(refreshedTokens.length, originalTokens.length);
      
      refreshedTokens.forEach((refreshedToken, index) => {
        const originalToken = originalTokens[index];
        assert.strictEqual(refreshedToken.amount, originalToken.amount);
        assert.strictEqual(refreshedToken.parentTokenId, originalToken.tokenId);
        assert.ok(refreshedToken.expiresAt > originalToken.expiresAt);
        assert.ok(otmService.verifyTokenSignature(refreshedToken));
      });
    });
  });

  describe('Token Refresh Analysis', () => {
    beforeEach(() => {
      otmService.generateKeyPair();
    });

    test('should identify tokens needing refresh', () => {
      const amount = web3.utils.toWei('1', 'ether');
      
      // Create tokens with different expiry states
      const validToken = otmService.issueToken(amount, 24); // 24 hours
      const nearExpiryToken = otmService.issueToken(amount, 1); // 1 hour
      const expiredRedeemableToken = otmService.issueToken(amount, 1);
      const expiredNonRedeemableToken = otmService.issueToken(amount, 1);
      
      // Manually set expiry times
      expiredRedeemableToken.expiresAt = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      expiredNonRedeemableToken.expiresAt = Math.floor(Date.now() / 1000) - (25 * 3600); // 25 hours ago

      const tokens = [validToken, nearExpiryToken, expiredRedeemableToken, expiredNonRedeemableToken];
      const analysis = otmService.getTokensNeedingRefresh(tokens);

      assert.strictEqual(analysis.nearExpiry.length, 1);
      assert.strictEqual(analysis.nearExpiry[0].tokenId, nearExpiryToken.tokenId);
      
      assert.strictEqual(analysis.expiredButRedeemable.length, 1);
      assert.strictEqual(analysis.expiredButRedeemable[0].tokenId, expiredRedeemableToken.tokenId);
      
      assert.strictEqual(analysis.expired.length, 1);
      assert.strictEqual(analysis.expired[0].tokenId, expiredNonRedeemableToken.tokenId);
    });

    test('should handle empty token list', () => {
      const analysis = otmService.getTokensNeedingRefresh([]);

      assert.strictEqual(analysis.nearExpiry.length, 0);
      assert.strictEqual(analysis.expiredButRedeemable.length, 0);
      assert.strictEqual(analysis.expired.length, 0);
    });
  });

  describe('Enhanced Token Validation with Expiry', () => {
    beforeEach(() => {
      otmService.generateKeyPair();
    });

    test('should validate token with expiry warnings', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 1); // 1 hour from now

      const validation = otmService.validateTokenWithExpiry(token);

      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.errors.length, 0);
      assert.strictEqual(validation.warnings.length, 1);
      assert.ok(validation.warnings[0].includes('expires in'));
      assert.strictEqual(validation.expiryInfo.isNearExpiry, true);
    });

    test('should validate expired but redeemable token', () => {
      const web3Instance = new Web3();
      const amount = web3Instance.utils.toWei('1', 'ether');
      
      // Create a token that was issued 2 hours ago and expires 1 hour ago
      const now = Math.floor(Date.now() / 1000);
      const issuedAt = now - (2 * 3600); // 2 hours ago
      const expiresAt = now - 3600; // 1 hour ago (expired but within redemption window)
      
      // Create token manually with past timestamps
      const tokenId = `${issuedAt * 1000}-${'a'.repeat(32)}`;
      const nonce = 1;
      const keyPair = otmService.getKeyPair()!;
      
      // Create message and sign it
      const message = [
        tokenId,
        amount,
        keyPair.address,
        issuedAt.toString(),
        expiresAt.toString(),
        nonce.toString(),
        ''
      ].join('|');
      
      const messageHash = web3Instance.utils.keccak256(message);
      const signature = web3Instance.eth.accounts.sign(messageHash, keyPair.privateKey);
      
      const expiredToken: OfflineToken = {
        tokenId,
        amount,
        issuer: keyPair.address,
        issuedAt,
        expiresAt,
        signature: signature.signature,
        nonce
      };

      const validation = otmService.validateTokenWithExpiry(expiredToken);

      assert.strictEqual(validation.isValid, true); // Should be valid for redemption
      assert.strictEqual(validation.errors.length, 0);
      assert.strictEqual(validation.warnings.length, 1);
      assert.ok(validation.warnings[0].includes('expired but can still be redeemed'));
      assert.strictEqual(validation.expiryInfo.isExpired, true);
      assert.strictEqual(validation.expiryInfo.canBeRedeemed, true);
    });

    test('should reject expired non-redeemable token', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const token = otmService.issueToken(amount, 1);
      
      // Set expiry to 25 hours ago
      token.expiresAt = Math.floor(Date.now() / 1000) - (25 * 3600);

      const validation = otmService.validateTokenWithExpiry(token);

      assert.strictEqual(validation.isValid, false);
      assert.ok(validation.errors.includes('Token has expired'));
      assert.strictEqual(validation.expiryInfo.isExpired, true);
      assert.strictEqual(validation.expiryInfo.canBeRedeemed, false);
    });
  });

  describe('Auto Cache Recommendations', () => {
    beforeEach(() => {
      otmService.generateKeyPair();
    });

    test('should recommend refresh for tokens needing it', () => {
      const amount = web3.utils.toWei('1', 'ether');
      
      const validToken = otmService.issueToken(amount, 24);
      const nearExpiryToken = otmService.issueToken(amount, 1);
      const expiredRedeemableToken = otmService.issueToken(amount, 1);
      
      // Set expiry to 1 hour ago
      expiredRedeemableToken.expiresAt = Math.floor(Date.now() / 1000) - 3600;

      const tokens = [validToken, nearExpiryToken, expiredRedeemableToken];
      const recommendations = otmService.getAutoCacheRecommendations(tokens);

      assert.strictEqual(recommendations.shouldRefresh, true);
      assert.strictEqual(recommendations.tokensToRefresh.length, 2);
      
      const expectedAmount = web3.utils.toBigInt(amount) * 2n; // Two tokens needing refresh
      assert.strictEqual(recommendations.recommendedAmount, expectedAmount.toString());
      assert.strictEqual(recommendations.recommendedExpiryHours, 24);
    });

    test('should not recommend refresh for valid tokens', () => {
      const amount = web3.utils.toWei('1', 'ether');
      const validTokens = [
        otmService.issueToken(amount, 24),
        otmService.issueToken(amount, 48)
      ];

      const recommendations = otmService.getAutoCacheRecommendations(validTokens);

      assert.strictEqual(recommendations.shouldRefresh, false);
      assert.strictEqual(recommendations.tokensToRefresh.length, 0);
      assert.strictEqual(recommendations.recommendedAmount, '0');
    });

    test('should handle empty token list', () => {
      const recommendations = otmService.getAutoCacheRecommendations([]);

      assert.strictEqual(recommendations.shouldRefresh, false);
      assert.strictEqual(recommendations.tokensToRefresh.length, 0);
      assert.strictEqual(recommendations.recommendedAmount, '0');
      assert.strictEqual(recommendations.recommendedExpiryHours, 24);
    });
  });
});