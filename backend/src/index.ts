import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import authRouter from './routes/auth';
import ambulancesRouter from './routes/ambulances';
import hospitalsRouter from './routes/hospitals';
import { setupSocketHandlers } from './socket/handlers';
import { testConnection } from './db';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 20000,
  pingInterval: 10000,
});

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── REST routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/ambulances', ambulancesRouter);
app.use('/api/hospitals', hospitalsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── WebSocket handlers ──────────────────────────────────────────────────────
setupSocketHandlers(io);

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);

httpServer.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  await testConnection();
});
