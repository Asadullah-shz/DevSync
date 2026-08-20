import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes.js';
import deviceRoutes from './modules/devices/devices.routes.js';
import workspaceRoutes from './modules/workspaces/workspaces.routes.js';
import projectRoutes from './modules/projects/projects.routes.js';
import storageRoutes from './modules/storage/storage.routes.js';
import syncRoutes from './modules/sync/sync.routes.js';
import versionsRoutes from './modules/versions/versions.routes.js';
import snapshotsRoutes from './modules/snapshots/snapshots.routes.js';
import conflictsRoutes from './modules/conflicts/conflicts.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import backupsRoutes from './modules/backups/backups.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import http from 'http';
import { initWebSocket } from './websocket/socket.js';

const app = express();
const server = http.createServer(app);

// Initialize WebSocket
initWebSocket(server);
app.use(cors());
app.use(express.json());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/workspaces', workspaceRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/storage', storageRoutes);
app.use('/api/v1/sync', syncRoutes);
app.use('/api/v1/versions', versionsRoutes);
app.use('/api/v1/snapshots', snapshotsRoutes);
app.use('/api/v1/conflicts', conflictsRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/backups', backupsRoutes);

app.get('/', (req, res) => res.send('DevSync Server'));

app.use(errorHandler);

server.listen(3000, () => console.log('Server running on port 3000'));
