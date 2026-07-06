class IdempotencyService {
  constructor(ttlSeconds = 86400) {
    this.seen = new Map(); // packetHash -> timestamp (ms)
    this.ttlMs = ttlSeconds * 1000;

    // Periodically evict expired entries (every 60 seconds)
    this.evictionInterval = setInterval(() => {
      this.evictExpired();
    }, 60000);

    // Unref the interval so it doesn't prevent Node process from exiting
    if (this.evictionInterval && typeof this.evictionInterval.unref === 'function') {
      this.evictionInterval.unref();
    }
  }

  /**
   * Try to claim a packet hash.
   * Returns true if first to claim; false if already claimed.
   * @param {string} packetHash 
   * @returns {boolean}
   */
  claim(packetHash) {
    const now = Date.now();
    if (this.seen.has(packetHash)) {
      return false;
    }
    this.seen.set(packetHash, now);
    return true;
  }

  /**
   * Release/delete a claimed hash from the cache.
   * @param {string} packetHash
   */
  release(packetHash) {
    this.seen.delete(packetHash);
  }

  /**
   * Returns size of the cache.
   * @returns {number}
   */
  size() {
    return this.seen.size;
  }

  /**
   * Evicts entries that are older than the TTL.
   */
  evictExpired() {
    const cutoff = Date.now() - this.ttlMs;
    for (const [hash, timestamp] of this.seen.entries()) {
      if (timestamp < cutoff) {
        this.seen.delete(hash);
      }
    }
  }

  /**
   * Clears the cache.
   */
  clear() {
    this.seen.clear();
  }

  /**
   * Destroys the eviction interval.
   */
  destroy() {
    clearInterval(this.evictionInterval);
  }
}

const idempotencyService = new IdempotencyService();
export default idempotencyService;
export { IdempotencyService };
