const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDb } = require('../database/db');

const getApiBaseUrl = () => `${apiService.getServerUrl()}/api/v1`;

class ApiService {
  getServerUrl() {
    if (process.env.DEVSYNC_SERVER_URL) {
      return process.env.DEVSYNC_SERVER_URL;
    }
    const configPath = path.join(os.homedir(), '.devsync', 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.serverUrl) {
          return config.serverUrl;
        }
      } catch (err) {
        console.error('[API] Failed to parse config.json:', err);
      }
    }
    return 'http://localhost:3000';
  }
  async request(endpoint, options = {}) {
    const session = await this.getSession();
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (session && session.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }

    const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error((data.error && data.error.message) || 'API Request Failed');
    }

    return data;
  }

  async uploadFile(endpoint, filePath) {
    const session = await this.getSession();
    const fs = require('fs/promises');
    
    const headers = {};
    if (session && session.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }

    const fileBuffer = await fs.readFile(filePath);
    const fileBlob = new Blob([fileBuffer]);
    
    const formData = new FormData();
    formData.append('file', fileBlob, filePath.split(/[\\/]/).pop());

    const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error((data.error && data.error.message) || 'Upload Failed');
    }

    return data;
  }

  async uploadChunk(endpoint, filePath, uploadId, chunkIndex, start, end) {
    const session = await this.getSession();
    const fs = require('fs');
    const { promisify } = require('util');
    const read = promisify(fs.read);
    
    const headers = {};
    if (session && session.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }

    // Read specific chunk into memory
    const length = end - start;
    const buffer = Buffer.alloc(length);
    
    const fd = await fs.promises.open(filePath, 'r');
    try {
      await fd.read(buffer, 0, length, start);
    } finally {
      await fd.close();
    }

    const fileBlob = new Blob([buffer]);
    const formData = new FormData();
    formData.append('chunk', fileBlob, `chunk-${chunkIndex}`);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', String(chunkIndex));

    const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error((data.error && data.error.message) || 'Chunk Upload Failed');
    return data;
  }

  async completeChunkUpload(endpoint, uploadId, totalChunks) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify({ uploadId, totalChunks })
    });
  }

  async downloadFile(endpoint, targetPath) {
    const session = await this.getSession();
    const fs = require('fs');
    const fsPromises = require('fs/promises');
    const path = require('path');
    const { pipeline } = require('stream/promises');
    const { Readable } = require('stream');
    
    const headers = {};
    if (session && session.token) {
      headers['Authorization'] = `Bearer ${session.token}`;
    }

    const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      headers
    });

    if (!response.ok) {
      throw new Error('Download Failed');
    }

    await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });

    if (response.body) {
      // Use pipeline to stream the file to disk directly, bypassing RAM
      // Node 18+ fetch body is a web stream, so we convert it to Node readable stream
      const fileStream = fs.createWriteStream(targetPath);
      await pipeline(Readable.fromWeb(response.body), fileStream);
    } else {
      throw new Error('Empty response body');
    }
  }

  async getSession() {
    return await getDb().get('SELECT * FROM auth_session ORDER BY id DESC LIMIT 1');
  }

  async saveSession(token, user) {
    const db = getDb();
    await db.run('DELETE FROM auth_session'); 
    await db.run('INSERT INTO auth_session (token, user_id, email) VALUES (?, ?, ?)', [token, user.id, user.email]);
  }

  async clearSession() {
    await getDb().run('DELETE FROM auth_session');
  }
}

const apiService = new ApiService();
module.exports = apiService;
