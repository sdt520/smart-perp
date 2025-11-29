import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import walletsRouter from './routes/wallets.js';
import platformsRouter from './routes/platforms.js';
import coinsRouter from './routes/coins.js';
import authRouter from './routes/auth.js';
import favoritesRouter from './routes/favorites.js';
import { notesRouter } from './routes/notes.js';
import { tradesRouter } from './routes/trades.js';
import telegramRouter from './routes/telegram.js';
import { setupWebSocket, getClientCount } from './ws/index.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    process.env.CORS_ORIGIN,
  ].filter(Boolean) as string[],
  credentials: true,
}));
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/wallets', walletsRouter);
app.use('/api/platforms', platformsRouter);
app.use('/api/coins', coinsRouter);
app.use('/api/auth', authRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/notes', notesRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/telegram', telegramRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    wsClients: getClientCount(),
  });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// Setup WebSocket
setupWebSocket(server);

// Start server
server.listen(PORT, () => {
  console.log(`
🚀 Smart Perp API Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Server:    http://localhost:${PORT}
📊 API:       http://localhost:${PORT}/api
🔌 WebSocket: ws://localhost:${PORT}/ws
❤️  Health:    http://localhost:${PORT}/api/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

export default app;

