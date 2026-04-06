import type { Server } from 'http';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { statusRouter } from './routes/status';
import { healthRouter } from './routes/health';
import { markersRouter } from './routes/markers';
import { bansRouter } from './routes/bans';

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://ravenhud.com',
  'https://www.ravenhud.com',
  'https://therealpixelated.github.io',
  'https://pix-elated.github.io',
];

// Rate limiter: 100 requests per 15 minutes per IP.
// SSE stream connections are long-lived and would exhaust the window
// with legitimate usage (browser tab reopens, reconnects), so they're
// explicitly exempted — every other endpoint still pays the toll.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/api/bans/stream',
});

/**
 * Create and configure Express application
 */
export function createApiServer(): Application {
  const app = express();

  // Trust Azure Container Apps reverse proxy so req.ip reflects the real client IP
  app.set('trust proxy', true);

  // Enable CORS with restricted origins
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like health checks, curl, etc.)
        if (!origin) {
          callback(null, true);
          return;
        }
        if (ALLOWED_ORIGINS.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: false,
    })
  );

  // Apply rate limiting
  app.use(limiter);

  // Parse JSON bodies (2MB limit for screenshot payloads)
  app.use(express.json({ limit: '2mb' }));

  // Mount routes
  app.use('/api', statusRouter);
  app.use('/api', markersRouter);
  app.use('/api', bansRouter);
  app.use('/', healthRouter);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler - generic errors to prevent info leakage
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/**
 * Start the API server on the specified port.
 * Resolves with the underlying http.Server so callers (shutdown handler)
 * can close it on SIGTERM.
 */
export function startApiServer(app: Application, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, () => {
        console.log(`[API] HTTP server listening on port ${port}`);
        resolve(server);
      });

      server.on('error', (error) => {
        console.error('[API] Failed to start HTTP server:', error);
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}
