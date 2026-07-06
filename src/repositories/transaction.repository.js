import prisma from '../db.js';

class TransactionRepository {
  /**
   * Fetches the top 20 transactions ordered by ID in descending order.
   * @param {Object} [txClient] 
   * @returns {Promise<Array>}
   */
  async findTop20ByOrderByIdDesc(txClient = prisma) {
    return txClient.transaction.findMany({
      take: 20,
      orderBy: {
        id: 'desc'
      }
    });
  }

  /**
   * Checks if a transaction with the given packetHash already exists.
   * @param {string} packetHash 
   * @param {Object} [txClient] 
   * @returns {Promise<boolean>}
   */
  async existsByPacketHash(packetHash, txClient = prisma) {
    const count = await txClient.transaction.count({
      where: { packetHash }
    });
    return count > 0;
  }

  /**
   * Saves a new transaction.
   * @param {Object} transaction - Transaction data.
   * @param {Object} [txClient] - Optional transaction client.
   * @returns {Promise<Object>} The saved transaction.
   */
  async save(transaction, txClient = prisma) {
    return txClient.transaction.create({
      data: {
        packetHash: transaction.packetHash,
        senderVpa: transaction.senderVpa,
        receiverVpa: transaction.receiverVpa,
        amount: transaction.amount,
        signedAt: transaction.signedAt,
        settledAt: transaction.settledAt,
        bridgeNodeId: transaction.bridgeNodeId,
        hopCount: transaction.hopCount,
        status: transaction.status
      }
    });
  }
}

const transactionRepository = new TransactionRepository();
export default transactionRepository;
