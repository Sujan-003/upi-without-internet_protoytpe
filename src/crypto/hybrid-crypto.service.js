import crypto from 'crypto';
import serverKeyHolder from './server-key-holder.js';

class HybridCryptoService {
  constructor() {
    this.serverKey = serverKeyHolder;
  }

  /**
   * Encrypts a payment instruction using the server's public key.
   * @param {Object} instruction - The payment instruction object.
   * @param {KeyObject|string} publicKey - Server public key (KeyObject or base64 DER string).
   * @returns {string} Base64 encoded hybrid encrypted packet.
   */
  encrypt(instruction, publicKey) {
    const plaintext = JSON.stringify(instruction);

    // 1. Generate one-time 256-bit AES key and 12-byte IV
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    // 2. AES-256-GCM encrypt the plaintext
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    let aesCiphertext = cipher.update(plaintext, 'utf8');
    aesCiphertext = Buffer.concat([aesCiphertext, cipher.final()]);
    const gcmTag = cipher.getAuthTag(); // 16 bytes tag

    // Combine ciphertext and tag, where aesCiphertext has the GCM auth tag appended
    const ciphertextWithTag = Buffer.concat([aesCiphertext, gcmTag]);

    // 3. RSA-OAEP encrypt the AES key with SHA-256
    let pubKeyObj = publicKey;
    if (typeof publicKey === 'string') {
      const pubKeyDer = Buffer.from(publicKey, 'base64');
      pubKeyObj = crypto.createPublicKey({
        key: pubKeyDer,
        format: 'der',
        type: 'spki'
      });
    }

    const encryptedAesKey = crypto.publicEncrypt({
      key: pubKeyObj,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
      mgf1Hash: 'sha256'
    }, aesKey); // Output is 256 bytes for 2048-bit RSA

    // 4. Pack: [encrypted AES key (256 bytes)][IV (12 bytes)][AES ciphertext + tag]
    const packed = Buffer.concat([encryptedAesKey, iv, ciphertextWithTag]);

    return packed.toString('base64');
  }

  /**
   * Decrypts the hybrid encrypted packet using the server's private key.
   * @param {string} base64Ciphertext - Base64 encoded hybrid encrypted packet.
   * @returns {Object} Decrypted payment instruction.
   */
  decrypt(base64Ciphertext) {
    const all = Buffer.from(base64Ciphertext, 'base64');
    
    const RSA_ENCRYPTED_KEY_BYTES = 256;
    const GCM_IV_BYTES = 12;
    const GCM_TAG_BYTES = 16;

    if (all.length < RSA_ENCRYPTED_KEY_BYTES + GCM_IV_BYTES + GCM_TAG_BYTES) {
      throw new Error('Ciphertext too short');
    }

    // Unpack
    const encryptedAesKey = all.subarray(0, RSA_ENCRYPTED_KEY_BYTES);
    const iv = all.subarray(RSA_ENCRYPTED_KEY_BYTES, RSA_ENCRYPTED_KEY_BYTES + GCM_IV_BYTES);
    const ciphertextWithTag = all.subarray(RSA_ENCRYPTED_KEY_BYTES + GCM_IV_BYTES);

    // 1. RSA decrypt the AES key
    const privateKey = this.serverKey.getPrivateKey();
    const aesKeyBytes = crypto.privateDecrypt({
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
      mgf1Hash: 'sha256'
    }, encryptedAesKey);

    // 2. Split ciphertext and 16-byte GCM tag
    const ciphertextOnly = ciphertextWithTag.subarray(0, ciphertextWithTag.length - GCM_TAG_BYTES);
    const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - GCM_TAG_BYTES);

    // 3. AES-GCM decrypt & verify tag
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKeyBytes, iv);
    decipher.setAuthTag(tag);
    let plaintext = decipher.update(ciphertextOnly);
    plaintext = Buffer.concat([plaintext, decipher.final()]);

    return JSON.parse(plaintext.toString('utf8'));
  }

  /**
   * Computes the SHA-256 hash of the base64 ciphertext string.
   * @param {string} base64Ciphertext 
   * @returns {string} Lowercase hex SHA-256 hash.
   */
  hashCiphertext(base64Ciphertext) {
    return crypto.createHash('sha256').update(base64Ciphertext, 'utf8').digest('hex');
  }
}

const hybridCryptoService = new HybridCryptoService();
export default hybridCryptoService;
