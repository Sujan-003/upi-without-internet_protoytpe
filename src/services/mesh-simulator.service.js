import VirtualDevice from './virtual-device.js';

class MeshSimulatorService {
  constructor() {
    this.devices = new Map();
    this.seedDefaultDevices();
  }

  seedDefaultDevices() {
    this.devices.set('phone-alice', new VirtualDevice('phone-alice', false));
    this.devices.set('phone-stranger1', new VirtualDevice('phone-stranger1', false));
    this.devices.set('phone-stranger2', new VirtualDevice('phone-stranger2', false));
    this.devices.set('phone-stranger3', new VirtualDevice('phone-stranger3', false));
    this.devices.set('phone-bridge', new VirtualDevice('phone-bridge', true));
  }

  /**
   * Returns all devices.
   * @returns {Array<VirtualDevice>}
   */
  getDevices() {
    return Array.from(this.devices.values());
  }

  /**
   * Retrieves a device by its ID.
   * @param {string} id 
   * @returns {VirtualDevice}
   */
  getDevice(id) {
    return this.devices.get(id);
  }

  /**
   * Inject a packet into the mesh at the given device.
   * @param {string} senderDeviceId 
   * @param {Object} packet 
   */
  inject(senderDeviceId, packet) {
    const sender = this.devices.get(senderDeviceId);
    if (!sender) {
      throw new Error(`Unknown device: ${senderDeviceId}`);
    }
    sender.hold(packet);
  }

  /**
   * Run one gossip round: propagate packets between devices and decrement TTL.
   * @returns {Object} Gossip result details
   */
  gossipOnce() {
    let transfers = 0;
    const deviceList = Array.from(this.devices.values());

    // Snapshot what each device holds at the start of this round
    const snapshot = new Map();
    for (const d of deviceList) {
      // Create a shallow copy of the held packets array to freeze the state for this round
      snapshot.set(d.getDeviceId(), d.getHeldPackets());
    }

    for (const src of deviceList) {
      const srcId = src.getDeviceId();
      const srcPackets = snapshot.get(srcId) || [];

      for (const pkt of srcPackets) {
        if (pkt.ttl <= 0) continue;

        for (const dst of deviceList) {
          if (dst === src) continue;
          if (dst.holds(pkt.packetId)) continue;

          // Copy and decrement TTL
          const copy = {
            packetId: pkt.packetId,
            ttl: pkt.ttl - 1,
            createdAt: pkt.createdAt,
            ciphertext: pkt.ciphertext
          };
          dst.hold(copy);
          transfers++;
        }
      }
    }

    return {
      transfers,
      deviceCounts: this.snapshotMap()
    };
  }

  /**
   * Returns a map of deviceId -> packetCount.
   * @returns {Object}
   */
  snapshotMap() {
    const counts = {};
    for (const d of this.devices.values()) {
      counts[d.getDeviceId()] = d.packetCount();
    }
    return counts;
  }

  /**
   * Collects all packets held by bridges (devices with internet).
   * @returns {Array<Object>} List of uploads containing bridgeNodeId and packet
   */
  collectBridgeUploads() {
    const out = [];
    for (const d of this.devices.values()) {
      if (!d.hasInternet()) continue;
      for (const pkt of d.getHeldPackets()) {
        out.push({
          bridgeNodeId: d.getDeviceId(),
          packet: pkt
        });
      }
    }
    return out;
  }

  /**
   * Resets all packets held by the devices.
   */
  resetMesh() {
    for (const d of this.devices.values()) {
      d.clear();
    }
  }
}

const meshSimulatorService = new MeshSimulatorService();
export default meshSimulatorService;
export { MeshSimulatorService };
