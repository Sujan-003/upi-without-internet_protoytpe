import { Router } from 'express';
import serverKeyHolder from '../crypto/server-key-holder.js';
import demoService from '../services/demo.service.js';
import meshSimulatorService from '../services/mesh-simulator.service.js';
import bridgeIngestionService from '../services/bridge-ingestion.service.js';
import idempotencyService from '../services/idempotency.service.js';
import accountRepository from '../repositories/account.repository.js';
import transactionRepository from '../repositories/transaction.repository.js';

const router = Router();

// GET /api/server-key
router.get('/server-key', (req, res) => {
  res.json({
    publicKey: serverKeyHolder.getPublicKeyBase64(),
    algorithm: 'RSA-2048 / OAEP-SHA256',
    hybridScheme: 'RSA-OAEP encrypts an AES-256-GCM session key'
  });
});

// POST /api/demo/send
router.post('/demo/send', async (req, res) => {
  try {
    const { senderVpa, receiverVpa, amount, pin, ttl, startDevice } = req.body;
    const packetTtl = ttl !== undefined ? ttl : 5;
    
    const packet = await demoService.createPacket(
      senderVpa,
      receiverVpa,
      amount,
      pin,
      packetTtl
    );

    const startDeviceId = startDevice || 'phone-alice';
    meshSimulatorService.inject(startDeviceId, packet);

    res.json({
      packetId: packet.packetId,
      ciphertextPreview: packet.ciphertext.substring(0, 64) + '...',
      ttl: packet.ttl,
      injectedAt: startDeviceId
    });
  } catch (err) {
    console.error('Error in /api/demo/send:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mesh/state
router.get('/mesh/state', (req, res) => {
  const deviceData = meshSimulatorService.getDevices().map(d => ({
    deviceId: d.getDeviceId(),
    hasInternet: d.hasInternet(),
    packetCount: d.packetCount(),
    packetIds: d.getHeldPackets().map(p => p.packetId.substring(0, 8))
  }));

  res.json({
    devices: deviceData,
    idempotencyCacheSize: idempotencyService.size()
  });
});

// POST /api/mesh/gossip
router.post('/mesh/gossip', (req, res) => {
  const result = meshSimulatorService.gossipOnce();
  res.json({
    transfers: result.transfers,
    deviceCounts: result.deviceCounts
  });
});

// POST /api/mesh/flush
router.post('/mesh/flush', async (req, res) => {
  try {
    const uploads = meshSimulatorService.collectBridgeUploads();
    
    // Process concurrently simulating simultaneous uploads from separate bridges
    const results = await Promise.all(uploads.map(async (up) => {
      const hopCount = 5 - up.packet.ttl;
      const r = await bridgeIngestionService.ingest(up.packet, up.bridgeNodeId, hopCount);
      return {
        bridgeNode: up.bridgeNodeId,
        packetId: up.packet.packetId.substring(0, 8),
        outcome: r.outcome,
        reason: r.reason || '',
        transactionId: r.transactionId !== null && r.transactionId !== undefined ? r.transactionId : -1
      };
    }));

    res.json({
      uploadsAttempted: uploads.length,
      results
    });
  } catch (err) {
    console.error('Error in /api/mesh/flush:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mesh/reset
router.post('/mesh/reset', (req, res) => {
  meshSimulatorService.resetMesh();
  idempotencyService.clear();
  res.json({ status: 'mesh and idempotency cache cleared' });
});

// POST /api/bridge/ingest
router.post('/bridge/ingest', async (req, res) => {
  try {
    const packet = req.body;
    const bridgeNodeId = req.header('X-Bridge-Node-Id') || 'unknown';
    const hopCount = parseInt(req.header('X-Hop-Count') || '0', 10);

    const result = await bridgeIngestionService.ingest(packet, bridgeNodeId, hopCount);
    res.json(result);
  } catch (err) {
    console.error('Error in /api/bridge/ingest:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/accounts
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await accountRepository.findAll();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions
router.get('/transactions', async (req, res) => {
  try {
    const transactions = await transactionRepository.findTop20ByOrderByIdDesc();
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
