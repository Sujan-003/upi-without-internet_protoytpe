import prisma from '../db.js';

class AccountRepository {
  /**
   * Finds an account by VPA.
   * @param {string} vpa 
   * @param {Object} [txClient] - Optional transaction client 
   * @returns {Promise<Object|null>} The account or null.
   */
  async findById(vpa, txClient = prisma) {
    return txClient.account.findUnique({
      where: { vpa }
    });
  }

  /**
   * Counts the number of accounts.
   * @returns {Promise<number>}
   */
  async count() {
    return prisma.account.count();
  }

  /**
   * Returns all accounts.
   * @returns {Promise<Array>}
   */
  async findAll() {
    return prisma.account.findMany();
  }

  /**
   * Saves (inserts or updates) an account with optimistic locking check.
   * @param {Object} account - The account to save.
   * @param {Object} [txClient] - Optional transaction client.
   * @returns {Promise<Object>} The saved account.
   */
  async save(account, txClient = prisma) {
    // If the account already has a version, we perform an update with optimistic locking
    if (account.version !== undefined && account.version !== null) {
      const updated = await txClient.account.updateMany({
        where: {
          vpa: account.vpa,
          version: account.version
        },
        data: {
          holderName: account.holderName,
          balance: account.balance,
          version: { increment: 1 }
        }
      });

      if (updated.count === 0) {
        throw new Error('OptimisticLockException');
      }
      
      account.version = account.version + 1;
      return account;
    } else {
      // Otherwise, we do an upsert
      const saved = await txClient.account.upsert({
        where: { vpa: account.vpa },
        update: {
          holderName: account.holderName,
          balance: account.balance
        },
        create: {
          vpa: account.vpa,
          holderName: account.holderName,
          balance: account.balance,
          version: 0
        }
      });
      account.version = saved.version;
      return saved;
    }
  }
}

const accountRepository = new AccountRepository();
export default accountRepository;
