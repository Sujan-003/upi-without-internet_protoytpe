import crypto from 'crypto';

class ServerKeyHolder {
  constructor() {
    this.publicKey = null;
    this.privateKey = null;
    this.publicKeyBase64 = null;
  }

  init() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    
    // Export public key as DER (binary SPKI format) and base64-encode it
    const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
    this.publicKeyBase64 = publicKeyDer.toString('base64');
  }

  getPublicKey() {
    return this.publicKey;
  }

  getPrivateKey() {
    return this.privateKey;
  }

  getPublicKeyBase64() {
    return this.publicKeyBase64;
  }
}

const serverKeyHolder = new ServerKeyHolder();
serverKeyHolder.init();

export default serverKeyHolder;
