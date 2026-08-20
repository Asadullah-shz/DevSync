import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
import healthRoutes from './modules/health/health.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import { BackupScheduler } from './modules/backups/backup.scheduler.js';
import { RecoveryService } from './modules/backups/recovery.service.js';
import { errorHandler } from './middleware/error.middleware.js';
import http from 'http';
import { initWebSocket } from './websocket/socket.js';
import passport from './modules/auth/passport.js';
import RedisStore from 'rate-limit-redis';

import { createClient } from 'redis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '../public');

const app = express();
const server = http.createServer(app);

// Initialize WebSocket (runs async to connect to Redis if configured)
initWebSocket(server).catch(err => console.error('[WebSocket] Init error:', err));

// Security Middleware with Content Security Policy to support dashboard CDNs and Google Fonts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  }
}));

let rateLimitStore: any = undefined;

if (process.env.REDIS_URL) {
  const redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.connect().catch(console.error);

  rateLimitStore = new RedisStore({

    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  });
  console.log('[App] Redis rate limiting enabled');
}

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  store: rateLimitStore,
});
app.use('/api/v1/', globalLimiter);

const syncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Sync rate limit exceeded, please wait.',
  store: rateLimitStore,
});

app.use(cors());
app.use(express.json());
app.use(passport.initialize());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 auth requests per windowMs
  message: 'Too many authentication attempts, please try again after 15 minutes',
  store: rateLimitStore,
});
app.use('/api/v1/auth', authLimiter, authRoutes);

app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/workspaces', workspaceRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/storage', syncLimiter, storageRoutes);
app.use('/api/v1/sync', syncLimiter, syncRoutes);
app.use('/api/v1/versions', versionsRoutes);
app.use('/api/v1/snapshots', snapshotsRoutes);
app.use('/api/v1/conflicts', conflictsRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/backups', backupsRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/admin', adminRoutes);

// Mount public folder for static dashboard resources relative to source directory
app.use('/public', express.static(PUBLIC_DIR));
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

app.get('/', (req, res) => res.send('DevSync Server'));

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  server.listen(3000, async () => {
    console.log('Server running on port 3000');
    
    // Attempt auto-recovery if database is completely empty
    await RecoveryService.autoRecoverIfEmpty();
    
    BackupScheduler.start();
  });

  // Graceful shutdown — handle Docker stop / Ctrl-C / process manager signals
  const shutdown = async (signal: string) => {
    console.log(`\n[Shutdown] Received ${signal}. Gracefully shutting down...`);

    // Stop accepting new HTTP connections
    server.close(async () => {
      console.log('[Shutdown] HTTP server closed. Draining in-flight requests done.');

      // Disconnect from MongoDB via Prisma
      try {
        const { db } = await import('./database/db.js');
        await db.$disconnect();
        console.log('[Shutdown] Database disconnected cleanly.');
      } catch (err) {
        console.error('[Shutdown] Error disconnecting from database:', err);
      }

      console.log('[Shutdown] Goodbye.');
      process.exit(0);
    });

    // Force exit after 10 seconds if requests are still pending
    setTimeout(() => {
      console.error('[Shutdown] Forced exit after timeout — some requests may have been dropped.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export { app, server };
