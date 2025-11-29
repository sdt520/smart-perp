import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import walletsRouter from './routes/wallets.js';
import platformsRouter from './routes/platforms.js';
import coinsRouter from './routes/coins.js';
import authRouter from './routes/auth.js';
import favoritesRouter from './routes/favorites.js';
import { notesRouter } from './routes/notes.js';

const app = express();
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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
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

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 Smart Perp API Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Server:    http://localhost:${PORT}
📊 API:       http://localhost:${PORT}/api
❤️  Health:    http://localhost:${PORT}/api/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

export default app;

