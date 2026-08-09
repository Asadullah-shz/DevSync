const crypto = require('crypto');
const fs = require('fs');

/**
 * Calculates the SHA-256 hash of a file.
 * We use streams to handle large files efficiently without loading them into memory.
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('error', (err) => reject(err));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

module.exports = {
  hashFile
};
