const crypto = require('crypto');
const os = require('os');
const { getDb } = require('../database/db');

class DeviceService {
  async initIdentity() {
    const db = getDb();
    let identity = await db.get('SELECT * FROM device_identity ORDER BY id DESC LIMIT 1');

    if (!identity) {
      console.log('No device identity found. Generating new RSA key pair...');
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      const result = await db.run('INSERT INTO device_identity (private_key, public_key) VALUES (?, ?)', [privateKey, publicKey]);
      
      identity = await db.get('SELECT * FROM device_identity WHERE id = ?', [result.lastID]);
    }

    return identity;
  }

  async getIdentity() {
    return await getDb().get('SELECT * FROM device_identity ORDER BY id DESC LIMIT 1');
  }

  async setRegisteredDeviceId(deviceId) {
    const identity = await this.getIdentity();
    if (identity) {
      await getDb().run(
        'UPDATE device_identity SET device_id = ?, registered_at = ? WHERE id = ?',
        [deviceId, new Date().toISOString(), identity.id]
      );
    }
  }

  getDeviceInfo() {
    return {
      deviceName: os.hostname(),
      hostname: os.hostname(),
      platform: os.platform(),
      platformVersion: os.release(),
      appVersion: '1.0.0'
    };
  }
}

module.exports = new DeviceService();
