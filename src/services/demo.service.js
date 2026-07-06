import crypto from 'crypto';
import hybridCryptoService from '../crypto/hybrid-crypto.service.js';
import serverKeyHolder from '../crypto/server-key-holder.js';
import accountRepository from '../repositories/account.repository.js';
import { Prisma } from '@prisma/client';

class DemoService {
  constructor() {
    this.accounts = accountRepository;
    this.crypto = hybridCryptoService;
    this.serverKey = serverKeyHolder;
  }

  /**
   * Seeds demo accounts on startup if database is empty.
   */
  async seedAccounts() {
    const count = await this.accounts.count();
    if (count === 0) {
      await this.accounts.save({ vpa: 'alice@demo', holderName: 'Alice', balance: new Prisma.Decimal('5000.00') });
      await this.accounts.save({ vpa: 'bob@demo', holderName: 'Bob', balance: new Prisma.Decimal('1000.00') });
      await this.accounts.save({ vpa: 'carol@demo', holderName: 'Carol', balance: new Prisma.Decimal('2500.00') });
      await this.accounts.save({ vpa: 'dave@demo', holderName: 'Dave', balance: new Prisma.Decimal('500.00') });
      console.log('Seeded 4 demo accounts (in-memory setup fallback)');
    }
  }

  /**
   * Simulates sender's phone creating an encrypted mesh packet.
   * 
   * @param {string} senderVpa 
   * @param {string} receiverVpa 
   * @param {number|Decimal} amount 
   * @param {string} pin - Plaintext PIN to hash
   * @param {number} ttl 
   * @returns {Promise<Object>} The generated MeshPacket object
   */
  async createPacket(senderVpa, receiverVpa, amount, pin, ttl) {
    const pinHash = this.sha256Hex(pin);
    const instruction = {
      senderVpa,
      receiverVpa,
      amount: amount,
      pinHash,
      nonce: crypto.randomUUID(),
      signedAt: Date.now()
    };

    const ciphertext = this.crypto.encrypt(instruction, this.serverKey.getPublicKey());

    const packet = {
      packetId: crypto.randomUUID(),
      ttl: ttl,
      createdAt: Date.now(),
      ciphertext
    };

    return packet;
  }

  /**
   * SHA-256 utility.
   * @private
   */
  sha256Hex(input) {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  }
}

const demoService = new DemoService();
export default demoService;
export { DemoService };
