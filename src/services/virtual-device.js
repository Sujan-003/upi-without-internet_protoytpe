class VirtualDevice {
  constructor(deviceId, hasInternet) {
    this.deviceId = deviceId;
    this._hasInternet = hasInternet;
    this.heldPackets = new Map(); // packetId -> MeshPacket
  }

  getDeviceId() {
    return this.deviceId;
  }

  hasInternet() {
    return this._hasInternet;
  }

  /**
   * Holds the packet if it doesn't already hold it.
   * Equivalent to putIfAbsent.
   * @param {Object} packet - MeshPacket shape
   */
  hold(packet) {
    if (!this.heldPackets.has(packet.packetId)) {
      this.heldPackets.set(packet.packetId, packet);
    }
  }

  /**
   * Returns all held packets.
   * @returns {Array}
   */
  getHeldPackets() {
    return Array.from(this.heldPackets.values());
  }

  /**
   * Checks if this device holds a packet.
   * @param {string} packetId 
   * @returns {boolean}
   */
  holds(packetId) {
    return this.heldPackets.has(packetId);
  }

  /**
   * Returns packet count.
   * @returns {number}
   */
  packetCount() {
    return this.heldPackets.size;
  }

  /**
   * Clears held packets.
   */
  clear() {
    this.heldPackets.clear();
  }
}

export default VirtualDevice;
