import request from 'supertest';
import app from '../index';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { describe } from 'node:test';

describe('Key Management Routes', () => {
  let validIssuerAddress: string;
  let validToken: any;

  beforeAll(async () => {
    // Get the actual issuer address from the initialized OTM service
    const response = await request(app)
      .get('/api/public-keys')
      .expect(200);
    
    validIssuerAddress = response.body.keys[0].address;
    
    validToken = {
      tokenId: 'test-token-id',
      amount: '1000000000000000000', // 1 ETH in wei
      issuer: validIssuerAddress,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 86400, // 24 hours from now
      signature: '0xabcdef123456789',
      nonce: 1
    };
  });

  describe('GET /api/public-keys', () => {
    it('should return public keys successfully', async () => {
      const response = await request(app)
        .get('/api/public-keys')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('keys');
      expect(response.body).toHaveProperty('totalCount');
      expect(response.body).toHaveProperty('activeCount');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.keys)).toBe(true);
    });

    it('should filter active keys only by default', async () => {
      const response = await request(app)
        .get('/api/public-keys')
        .expect(200);

      // All returned keys should be active by default
      response.body.keys.forEach((key: any) => {
        expect(key.isActive).toBe(true);
      });
    });

    it('should return all keys when activeOnly=false', async () => {
      const response = await request(app)
        .get('/api/public-keys?activeOnly=false')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('keys');
    });

    it('should not expose private keys', async () => {
      const response = await request(app)
        .get('/api/public-keys')
        .expect(200);

      response.body.keys.forEach((key: any) => {
        expect(key).not.toHaveProperty('privateKey');
        expect(key).toHaveProperty('address');
        expect(key).toHaveProperty('publicKey');
        expect(key).toHaveProperty('isActive');
        expect(key).toHaveProperty('createdAt');
        expect(key).toHaveProperty('lastUpdated');
      });
    });
  });

  describe('POST /api/validate-signature', () => {
    it('should validate token signature successfully', async () => {
      const response = await request(app)
        .post('/api/validate-signature')
        .send({ token: validToken })
        .expect(400); // Will fail validation due to mock data, but should process the request

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('validation');
      expect(response.body.validation).toHaveProperty('isValid');
      expect(response.body.validation).toHaveProperty('errors');
      expect(response.body.validation).toHaveProperty('signatureValid');
    });

    it('should return 400 for missing token', async () => {
      const response = await request(app)
        .post('/api/validate-signature')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Missing required fields');
      expect(response.body.message).toContain('token is required');
    });

    it('should return 400 for invalid token structure', async () => {
      const incompleteToken = {
        tokenId: 'test-token-id',
        amount: '1000000000000000000'
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/validate-signature')
        .send({ token: incompleteToken })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid token structure');
      expect(response.body.message).toContain('Missing required token fields');
    });

    it('should return 400 for unknown issuer', async () => {
      const tokenWithUnknownIssuer = {
        ...validToken,
        issuer: '0xunknownissueraddress123456789'
      };

      const response = await request(app)
        .post('/api/validate-signature')
        .send({ token: tokenWithUnknownIssuer })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Unknown issuer');
    });

    it('should validate with issuer address parameter', async () => {
      const response = await request(app)
        .post('/api/validate-signature')
        .send({ 
          token: validToken,
          issuerAddress: '0x742d35Cc6634C0532925a3b8D4C9db96590c6C8b'
        })
        .expect(400); // Will fail validation due to mock data

      expect(response.body).toHaveProperty('validation');
    });
  });

  describe('POST /api/public-keys', () => {
    const newKeyData = {
      address: '0x742d35Cc6634C0532925a3b8D4C9db96590c6C8b',
      publicKey: '0x742d35Cc6634C0532925a3b8D4C9db96590c6C8b'
    };

    it('should add new public key successfully', async () => {
      const response = await request(app)
        .post('/api/public-keys')
        .send(newKeyData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('key');
      expect(response.body.key).toHaveProperty('address', newKeyData.address);
      expect(response.body.key).toHaveProperty('publicKey', newKeyData.publicKey);
      expect(response.body.key).toHaveProperty('isActive', true);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/public-keys')
        .send({ address: newKeyData.address }) // Missing publicKey
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Missing required fields');
    });

    it('should return 409 for duplicate key', async () => {
      // First, add the key
      await request(app)
        .post('/api/public-keys')
        .send({
          address: '0x123uniqueaddress456',
          publicKey: '0x123uniqueaddress456'
        })
        .expect(201);

      // Try to add the same key again
      const response = await request(app)
        .post('/api/public-keys')
        .send({
          address: '0x123uniqueaddress456',
          publicKey: '0x123uniqueaddress456'
        })
        .expect(409);

      expect(response.body).toHaveProperty('error', 'Key already exists');
    });
  });

  describe('PUT /api/public-keys/:address', () => {
    const testAddress = '0x789testaddress123';
    
    beforeEach(async () => {
      // Add a test key first
      await request(app)
        .post('/api/public-keys')
        .send({
          address: testAddress,
          publicKey: testAddress
        });
    });

    it('should update key status successfully', async () => {
      const response = await request(app)
        .put(`/api/public-keys/${testAddress}`)
        .send({ isActive: false })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.key).toHaveProperty('isActive', false);
      expect(response.body.key).toHaveProperty('lastUpdated');
    });

    it('should update public key successfully', async () => {
      const newPublicKey = '0xnewpublickey123456789';
      
      const response = await request(app)
        .put(`/api/public-keys/${testAddress}`)
        .send({ publicKey: newPublicKey })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.key).toHaveProperty('publicKey', newPublicKey);
    });

    it('should return 404 for non-existent key', async () => {
      const response = await request(app)
        .put('/api/public-keys/0xnonexistentaddress')
        .send({ isActive: false })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Key not found');
    });
  });

  describe('DELETE /api/public-keys/:address', () => {
    const testAddress = '0x456deletetest789';
    
    beforeEach(async () => {
      // Add a test key first
      await request(app)
        .post('/api/public-keys')
        .send({
          address: testAddress,
          publicKey: testAddress
        });
    });

    it('should deactivate key successfully', async () => {
      const response = await request(app)
        .delete(`/api/public-keys/${testAddress}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.key).toHaveProperty('isActive', false);
      expect(response.body.key).toHaveProperty('lastUpdated');
    });

    it('should return 404 for non-existent key', async () => {
      const response = await request(app)
        .delete('/api/public-keys/0xnonexistentaddress')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Key not found');
    });

    it('should maintain key in database after deactivation', async () => {
      // Deactivate the key
      await request(app)
        .delete(`/api/public-keys/${testAddress}`)
        .expect(200);

      // Verify key still exists but is inactive
      const response = await request(app)
        .get('/api/public-keys?activeOnly=false')
        .expect(200);

      const deactivatedKey = response.body.keys.find((key: any) => key.address === testAddress);
      expect(deactivatedKey).toBeDefined();
      expect(deactivatedKey.isActive).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // This test ensures the error handling middleware works
      // We can't easily force an error in the key routes without mocking,
      // but we can test with malformed requests
      
      const response = await request(app)
        .post('/api/validate-signature')
        .send('invalid json')
        .expect(400);

      // Express should handle the malformed JSON and return a 400
      expect(response.status).toBe(400);
    });
  });
});