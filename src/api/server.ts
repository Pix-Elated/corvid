import express, { Application } from 'express';
import cors from 'cors';
import { statusRouter } from './routes/status';
import { healthRouter } from './routes/health';

/**
 * Create and configure Express application
 */
export function createApiServer(): Application {
  const app = express();

  // Enable CORS for all origins
  app.use(cors());

  // Parse JSON bodies
  app.use(express.json());

  // Mount routes
  app.use('/api', statusRouter);
  app.use('/', healthRouter);

  return app;
}

/**
 * Start the API server on the specified port
 */
export function startApiServer(app: Application, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, () => {
        console.log(`[API] HTTP server listening on port ${port}`);
        resolve();
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
