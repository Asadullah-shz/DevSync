import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes.js';
import deviceRoutes from './modules/devices/devices.routes.js';
import workspaceRoutes from './modules/workspaces/workspaces.routes.js';
import projectRoutes from './modules/projects/projects.routes.js';
import storageRoutes from './modules/storage/storage.routes.js';
import syncRoutes from './modules/sync/sync.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/workspaces', workspaceRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/storage', storageRoutes);
app.use('/api/v1/sync', syncRoutes);

app.get('/', (req, res) => res.send('DevSync Server'));

app.use(errorHandler);

app.listen(3000, () => console.log('Server running on port 3000'));
