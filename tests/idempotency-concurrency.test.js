import prisma from '../src/db.js';
import demoService from '../src/services/demo.service.js';
import bridgeIngestionService from '../src/services/bridge-ingestion.service.js';
import idempotencyService from '../src/services/idempotency.service.js';
import accountRepository from '../src/repositories/account.repository.js';

describe('Idempotency and Concurrency Tests', () => {
  beforeEach(async () => {
    // 1. Clear idempotency seen map
    idempotencyService.clear();

    // 2. Clear transaction ledger
    await prisma.transaction.deleteMany();

    // 3. Reset balances
    await prisma.account.update({
      where: { vpa: 'alice@demo' },
      data: { balance: 5000.00, version: 0 }
    });
    await prisma.account.update({
      where: { vpa: 'bob@demo' },
      data: { balance: 1000.00, version: 0 }
    });
  });

  afterAll(async () => {
    idempotencyService.destroy();
    await prisma.$disconnect();
  });

  test('single packet delivered by three bridges concurrently settles exactly once', async () => {
    // Check starting balances
    const aliceBefore = await accountRepository.findById('alice@demo');
    const bobBefore = await accountRepository.findById('bob@demo');

    // Create a packet: Alice sends Bob ₹100
    const packet = await demoService.createPacket(
      'alice@demo',
      'bob@demo',
      100.00,
      '1234',
      5
    );

    // Call bridgeIngestionService.ingest concurrently using Promise.all
    const results = await Promise.all([
      bridgeIngestionService.ingest(packet, 'bridge-0', 3),
      bridgeIngestionService.ingest(packet, 'bridge-1', 3),
      bridgeIngestionService.ingest(packet, 'bridge-2', 3)
    ]);

    let settledCount = 0;
    let duplicateCount = 0;

    for (const r of results) {
      if (r.outcome === 'SETTLED') settledCount++;
      else if (r.outcome === 'DUPLICATE_DROPPED') duplicateCount++;
    }

    expect(settledCount).toBe(1);
    expect(duplicateCount).toBe(2);

    // Check balances
    const aliceAfter = await accountRepository.findById('alice@demo');
    const bobAfter = await accountRepository.findById('bob@demo');

    expect(Number(aliceAfter.balance)).toBe(Number(aliceBefore.balance) - 100.00);
    expect(Number(bobAfter.balance)).toBe(Number(bobBefore.balance) + 100.00);
  });

  test('tampered ciphertext is rejected as INVALID', async () => {
    const packet = await demoService.createPacket(
      'alice@demo',
      'bob@demo',
      50.00,
      '1234',
      5
    );

    // Modify ciphertext
    const chars = packet.ciphertext.split('');
    const mid = Math.floor(chars.length / 2);
    chars[mid] = chars[mid] === 'A' ? 'B' : 'A';
    packet.ciphertext = chars.join('');

    const r = await bridgeIngestionService.ingest(packet, 'bridge-x', 1);
    expect(r.outcome).toBe('INVALID');
    expect(r.reason).toBe('decryption_failed');
  });
});
