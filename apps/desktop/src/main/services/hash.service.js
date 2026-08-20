const crypto = require('crypto');
const fs = require('fs');

class HashService {
  /**
   * Generates a SHA-256 hash for a given file path.
   * Reads the file as a stream to avoid memory limits on large files.
   * @param {string} filePath - Absolute path to the file
   * @returns {Promise<string>} The hex-encoded SHA-256 hash
   */
  hashFile(filePath) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        return reject(new Error(`File not found: ${filePath}`));
      }

      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => {
        hash.update(chunk);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Generates a hash from a string buffer.
   * @param {string|Buffer} content 
   */
  hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

module.exports = new HashService();
