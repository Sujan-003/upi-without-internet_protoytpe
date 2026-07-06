import hybridCryptoService from '../src/crypto/hybrid-crypto.service.js';
import serverKeyHolder from '../src/crypto/server-key-holder.js';

describe('Hybrid Cryptography Tests', () => {
  test('encrypt/decrypt roundtrip', () => {
    const original = {
      senderVpa: 'alice@demo',
      receiverVpa: 'bob@demo',
      amount: '123.45',
      pinHash: 'abcdef',
      nonce: 'nonce-1',
      signedAt: Date.now()
    };

    const ct = hybridCryptoService.encrypt(original, serverKeyHolder.getPublicKey());
    const decrypted = hybridCryptoService.decrypt(ct);

    expect(decrypted.senderVpa).toBe(original.senderVpa);
    expect(decrypted.receiverVpa).toBe(original.receiverVpa);
    expect(decrypted.amount).toBe(original.amount);
    expect(decrypted.pinHash).toBe(original.pinHash);
    expect(decrypted.nonce).toBe(original.nonce);
    expect(decrypted.signedAt).toBe(original.signedAt);
  });

  test('tampered ciphertext fails decryption', () => {
    const original = {
      senderVpa: 'alice@demo',
      receiverVpa: 'bob@demo',
      amount: '50.00',
      pinHash: '1234',
      nonce: 'nonce-2',
      signedAt: Date.now()
    };

    const ct = hybridCryptoService.encrypt(original, serverKeyHolder.getPublicKey());

    // Tamper with the ciphertext by flipping a character in the middle
    const chars = ct.split('');
    const mid = Math.floor(chars.length / 2);
    chars[mid] = chars[mid] === 'A' ? 'B' : 'A';
    const tamperedCt = chars.join('');

    expect(() => {
      hybridCryptoService.decrypt(tamperedCt);
    }).toThrow();
  });
});
