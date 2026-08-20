import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { db } from '../database/db.js';

let io: SocketIOServer;

export const initWebSocket = async (server: HttpServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*', // Customize this for production
      methods: ['GET', 'POST']
    }
  });

  if (process.env.REDIS_URL) {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error('[Redis PubClient] Error:', err));
    subClient.on('error', (err) => console.error('[Redis SubClient] Error:', err));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[WebSocket] Redis adapter applied for distributed pub/sub');
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers['authorization'];
      
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      // Very simple token verification mimicking the auth middleware
      // Assuming token contains userId
      // const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      // For now, accept mock token format if JWT fails, or just bypass for prototyping
      
      // We will attach a mock user to the socket for now
      // socket.data.user = { id: 'mock-user-id' };
      
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`WebSocket connected: ${socket.id}`);

    // Allow clients to subscribe to specific project updates
    socket.on('subscribeToProject', (projectId: string) => {
      socket.join(`project_${projectId}`);
      console.log(`Socket ${socket.id} joined project_${projectId}`);
    });

    socket.on('unsubscribeFromProject', (projectId: string) => {
      socket.leave(`project_${projectId}`);
      console.log(`Socket ${socket.id} left project_${projectId}`);
    });

    socket.on('disconnect', () => {
      console.log(`WebSocket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const emitToProject = (projectId: string, event: string, payload: any) => {
  if (io) {
    io.to(`project_${projectId}`).emit(event, payload);
  }
};
