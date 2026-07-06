import prisma from '../db.js';
import { Prisma } from '@prisma/client';
import accountRepository from '../repositories/account.repository.js';
import transactionRepository from '../repositories/transaction.repository.js';

class SettlementService {
  constructor() {
    this.accounts = accountRepository;
    this.transactions = transactionRepository;
  }

  /**
   * Settles a payment instruction within a database transaction.
   * Debits the sender and credits the receiver if balances are sufficient.
   * If insufficient balance, creates a REJECTED transaction ledger record.
   * 
   * @param {Object} instruction - The decrypted PaymentInstruction.
   * @param {string} packetHash - SHA-256 hash of ciphertext (idempotency key).
   * @param {string} bridgeNodeId - Bridge device that uploaded the packet.
   * @param {number} hopCount - Number of hops in mesh routing.
   * @returns {Promise<Object>} The generated Transaction record.
   */
  async settle(instruction, packetHash, bridgeNodeId, hopCount) {
    return prisma.$transaction(async (txClient) => {
      // 1. Fetch sender account
      const sender = await this.accounts.findById(instruction.senderVpa, txClient);
      if (!sender) {
        throw new Error(`Unknown sender VPA: ${instruction.senderVpa}`);
      }

      // 2. Fetch receiver account
      const receiver = await this.accounts.findById(instruction.receiverVpa, txClient);
      if (!receiver) {
        throw new Error(`Unknown receiver VPA: ${instruction.receiverVpa}`);
      }

      const amount = new Prisma.Decimal(instruction.amount);
      if (amount.lte(0)) {
        throw new Error('Amount must be positive');
      }

      // Check balance
      const senderBalance = new Prisma.Decimal(sender.balance);
      if (senderBalance.lt(amount)) {
        console.warn(`Insufficient balance: ${sender.vpa} has ₹${sender.balance}, tried to send ₹${amount}`);
        return this.recordRejected(instruction, packetHash, bridgeNodeId, hopCount, txClient);
      }

      // Update balances
      sender.balance = senderBalance.minus(amount);
      receiver.balance = new Prisma.Decimal(receiver.balance).plus(amount);

      // Save sender and receiver (triggering optimistic lock version check)
      await this.accounts.save(sender, txClient);
      await this.accounts.save(receiver, txClient);

      // Record transaction
      const tx = {
        packetHash,
        senderVpa: instruction.senderVpa,
        receiverVpa: instruction.receiverVpa,
        amount,
        signedAt: new Date(instruction.signedAt),
        settledAt: new Date(),
        bridgeNodeId,
        hopCount,
        status: 'SETTLED'
      };

      const savedTx = await this.transactions.save(tx, txClient);
      
      console.log(`SETTLED ₹${amount} from ${sender.vpa} to ${receiver.vpa} (packetHash=${packetHash.substring(0, 12)}..., bridge=${bridgeNodeId}, hops=${hopCount})`);
      
      return savedTx;
    });
  }

  /**
   * Records a rejected transaction in the database.
   * @private
   */
  async recordRejected(instruction, packetHash, bridgeNodeId, hopCount, txClient) {
    const tx = {
      packetHash,
      senderVpa: instruction.senderVpa,
      receiverVpa: instruction.receiverVpa,
      amount: new Prisma.Decimal(instruction.amount),
      signedAt: new Date(instruction.signedAt),
      settledAt: new Date(),
      bridgeNodeId,
      hopCount,
      status: 'REJECTED'
    };
    return this.transactions.save(tx, txClient);
  }
}

const settlementService = new SettlementService();
export default settlementService;
export { SettlementService };
