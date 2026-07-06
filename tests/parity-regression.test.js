import prisma from '../src/db.js';
import demoService from '../src/services/demo.service.js';
import bridgeIngestionService from '../src/services/bridge-ingestion.service.js';
import idempotencyService from '../src/services/idempotency.service.js';
import settlementService from '../src/services/settlement.service.js';
import hybridCryptoService from '../src/crypto/hybrid-crypto.service.js';
import transactionRepository from '../src/repositories/transaction.repository.js';
import accountRepository from '../src/repositories/account.repository.js';
import meshSimulatorService from '../src/services/mesh-simulator.service.js';
import { Prisma } from '@prisma/client';

describe('Parity and Regression Tests', () => {
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

    // 4. Reset mesh state
    meshSimulatorService.resetMesh();
  });

  afterAll(async () => {
    idempotencyService.destroy();
    await prisma.$disconnect();
  });

  test('duplicate packet already present in the DB returns DUPLICATE_DROPPED', async () => {
    const packet = await demoService.createPacket(
      'alice@demo',
      'bob@demo',
      50.00,
      '1234',
      5
    );
    const packetHash = bridgeIngestionService.crypto.hashCiphertext(packet.ciphertext);

    // Save directly to the DB to simulate existing settled transaction
    await transactionRepository.save({
      packetHash,
      senderVpa: 'alice@demo',
      receiverVpa: 'bob@demo',
      amount: new Prisma.Decimal('50.00'),
      signedAt: new Date(),
      settledAt: new Date(),
      bridgeNodeId: 'direct-insert',
      hopCount: 1,
      status: 'SETTLED'
    });

    // Clear in-memory cache so we force a database hit
    idempotencyService.clear();

    // Ingest the duplicate packet
    const result = await bridgeIngestionService.ingest(packet, 'bridge-0', 1);
    expect(result.outcome).toBe('DUPLICATE_DROPPED');
    expect(result.packetHash).toBe(packetHash);
  });

  test('unique constraint race on packetHash is treated as duplicate', async () => {
    const packet = await demoService.createPacket(
      'alice@demo',
      'bob@demo',
      60.00,
      '1234',
      5
    );
    const packetHash = bridgeIngestionService.crypto.hashCiphertext(packet.ciphertext);

    // Mock settlementService.settle to throw unique constraint P2002 error
    const originalSettle = settlementService.settle;
    settlementService.settle = async () => {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0'
      });
    };

    try {
      const result = await bridgeIngestionService.ingest(packet, 'bridge-0', 1);
      expect(result.outcome).toBe('DUPLICATE_DROPPED');
      expect(result.packetHash).toBe(packetHash);
    } finally {
      settlementService.settle = originalSettle;
    }
  });

  test('settlement failure after idempotency claim releases the claim and preserves real packet hash', async () => {
    const packet = await demoService.createPacket(
      'alice@demo',
      'bob@demo',
      70.00,
      '1234',
      5
    );
    const packetHash = bridgeIngestionService.crypto.hashCiphertext(packet.ciphertext);

    // Mock settlementService.settle to throw generic transient error
    const originalSettle = settlementService.settle;
    settlementService.settle = async () => {
      throw new Error('Transient settlement failure');
    };

    try {
      // First attempt fails, but should release the claim
      const result1 = await bridgeIngestionService.ingest(packet, 'bridge-0', 1);
      expect(result1.outcome).toBe('INVALID');
      expect(result1.packetHash).toBe(packetHash);
      expect(result1.reason).toContain('internal_error');

      // Restore original settle behavior
      settlementService.settle = originalSettle;

      // Second attempt (retry) should succeed because the claim was released
      const result2 = await bridgeIngestionService.ingest(packet, 'bridge-0', 1);
      expect(result2.outcome).toBe('SETTLED');
      expect(result2.packetHash).toBe(packetHash);
    } finally {
      settlementService.settle = originalSettle;
    }
  });

  test('decryption failure does not release in-memory claim', async () => {
    const packet = await demoService.createPacket(
      'alice@demo',
      'bob@demo',
      80.00,
      '1234',
      5
    );
    const packetHash = bridgeIngestionService.crypto.hashCiphertext(packet.ciphertext);

    // Mock decryption to fail
    const originalDecrypt = hybridCryptoService.decrypt;
    hybridCryptoService.decrypt = () => {
      throw new Error('Decryption failed mock');
    };

    try {
      // First attempt fails due to decryption error
      const result1 = await bridgeIngestionService.ingest(packet, 'bridge-0', 1);
      expect(result1.outcome).toBe('INVALID');
      expect(result1.reason).toBe('decryption_failed');

      // Restore decrypt behavior
      hybridCryptoService.decrypt = originalDecrypt;

      // Second attempt should be dropped as duplicate since claim was not released
      const result2 = await bridgeIngestionService.ingest(packet, 'bridge-0', 1);
      expect(result2.outcome).toBe('DUPLICATE_DROPPED');
    } finally {
      hybridCryptoService.decrypt = originalDecrypt;
    }
  });

  test('custom TTL hop count is computed correctly after gossip propagation', async () => {
    const packet = await demoService.createPacket(
      'alice@demo',
      'bob@demo',
      90.00,
      '1234',
      8
    );
    expect(packet.ttl).toBe(8);
    expect(packet.initialTtl).toBe(8);

    meshSimulatorService.inject('phone-alice', packet);

    // Propagate 1 round of gossip
    meshSimulatorService.gossipOnce();

    const bridge = meshSimulatorService.getDevice('phone-bridge');
    expect(bridge.holds(packet.packetId)).toBe(true);

    const heldPacket = bridge.heldPackets.get(packet.packetId);
    expect(heldPacket.ttl).toBe(7);
    expect(heldPacket.initialTtl).toBe(8);

    // Collect bridge uploads
    const uploads = meshSimulatorService.collectBridgeUploads();
    expect(uploads.length).toBe(1);

    const initialTtl = uploads[0].packet.initialTtl !== undefined ? uploads[0].packet.initialTtl : 5;
    const hopCount = initialTtl - uploads[0].packet.ttl;
    expect(hopCount).toBe(1);

    const ingestResult = await bridgeIngestionService.ingest(uploads[0].packet, uploads[0].bridgeNodeId, hopCount);
    expect(ingestResult.outcome).toBe('SETTLED');

    const tx = await prisma.transaction.findUnique({
      where: { packetHash: ingestResult.packetHash }
    });
    expect(tx.hopCount).toBe(1);
  });

  test('amount normalization stores encrypted instruction amount as string and settlement adjusts balance correctly', async () => {
    // 1. Create a packet with numeric amount 125.50
    const packet = await demoService.createPacket(
      'alice@demo',
      'bob@demo',
      125.50,
      '1234',
      5
    );

    // 2. Decrypt and check that amount is stored as string
    const decrypted = bridgeIngestionService.crypto.decrypt(packet.ciphertext);
    expect(typeof decrypted.amount).toBe('string');
    expect(decrypted.amount).toBe('125.5');

    // 3. Settle and verify balance changes
    const aliceBefore = await accountRepository.findById('alice@demo');
    const bobBefore = await accountRepository.findById('bob@demo');

    const ingestResult = await bridgeIngestionService.ingest(packet, 'bridge-0', 1);
    expect(ingestResult.outcome).toBe('SETTLED');

    const aliceAfter = await accountRepository.findById('alice@demo');
    const bobAfter = await accountRepository.findById('bob@demo');

    expect(new Prisma.Decimal(aliceAfter.balance).toString()).toBe(
      new Prisma.Decimal(aliceBefore.balance).minus('125.5').toString()
    );
    expect(new Prisma.Decimal(bobAfter.balance).toString()).toBe(
      new Prisma.Decimal(bobBefore.balance).plus('125.5').toString()
    );
  });
});
