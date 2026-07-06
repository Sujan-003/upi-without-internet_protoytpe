import hybridCryptoService from '../crypto/hybrid-crypto.service.js';
import idempotencyService from './idempotency.service.js';
import settlementService from './settlement.service.js';
import transactionRepository from '../repositories/transaction.repository.js';
import { Prisma } from '@prisma/client';

class BridgeIngestionService {
  constructor(maxAgeSeconds = 86400) {
    this.crypto = hybridCryptoService;
    this.idempotency = idempotencyService;
    this.settlement = settlementService;
    this.transactions = transactionRepository;
    this.maxAgeSeconds = maxAgeSeconds;
  }

  /**
   * Processes a packet received from a bridge device.
   * Runs the packet through the validation and settlement pipeline.
   * 
   * @param {Object} packet - MeshPacket containing ciphertext
   * @param {string} bridgeNodeId - Bridge identifier
   * @param {number} hopCount - Number of hops
   * @returns {Promise<Object>} IngestResult containing outcome, packetHash, reason, transactionId
   */
  async ingest(packet, bridgeNodeId, hopCount) {
    let packetHash = '?';
    try {
      packetHash = this.crypto.hashCiphertext(packet.ciphertext);

      // ---- Idempotency gate ----
      if (!this.idempotency.claim(packetHash)) {
        console.info(`DUPLICATE packet ${packetHash.substring(0, 12)}... from bridge ${bridgeNodeId} — dropped`);
        return {
          outcome: 'DUPLICATE_DROPPED',
          packetHash,
          reason: null,
          transactionId: null
        };
      }

      // ---- Decrypt ----
      let instruction;
      try {
        instruction = this.crypto.decrypt(packet.ciphertext);
      } catch (err) {
        console.warn(`Decryption failed for packet ${packetHash.substring(0, 12)}...: ${err.message}`);
        return {
          outcome: 'INVALID',
          packetHash,
          reason: 'decryption_failed',
          transactionId: null
        };
      }

      // ---- Freshness check (replay protection) ----
      const ageSeconds = (Date.now() - instruction.signedAt) / 1000;
      if (ageSeconds > this.maxAgeSeconds) {
        console.warn(`Packet ${packetHash.substring(0, 12)}... too old (${ageSeconds}s), rejected`);
        return {
          outcome: 'INVALID',
          packetHash,
          reason: 'stale_packet',
          transactionId: null
        };
      }
      if (ageSeconds < -300) { // small clock-skew tolerance
        console.warn(`Packet ${packetHash.substring(0, 12)}... future-dated (${ageSeconds}s), rejected`);
        return {
          outcome: 'INVALID',
          packetHash,
          reason: 'future_dated',
          transactionId: null
        };
      }

      // ---- DB Idempotency gate ----
      if (await this.transactions.existsByPacketHash(packetHash)) {
        console.info(`DUPLICATE packet ${packetHash.substring(0, 12)}... already in database — dropped`);
        return {
          outcome: 'DUPLICATE_DROPPED',
          packetHash,
          reason: null,
          transactionId: null
        };
      }

      // ---- Settle ----
      const tx = await this.settlement.settle(instruction, packetHash, bridgeNodeId, hopCount);
      return {
        outcome: 'SETTLED',
        packetHash,
        reason: null,
        transactionId: tx.id
      };

    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        console.info(`DUPLICATE packet ${packetHash.substring(0, 12)}... constraint race — dropped`);
        return {
          outcome: 'DUPLICATE_DROPPED',
          packetHash,
          reason: null,
          transactionId: null
        };
      }

      if (packetHash !== '?') {
        this.idempotency.release(packetHash);
      }

      console.error(`Ingestion error: ${err.message}`, err);
      return {
        outcome: 'INVALID',
        packetHash,
        reason: 'internal_error: ' + err.message,
        transactionId: null
      };
    }
  }
}

const bridgeIngestionService = new BridgeIngestionService();
export default bridgeIngestionService;
export { BridgeIngestionService };
