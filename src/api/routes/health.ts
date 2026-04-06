import { Router, Request, Response } from 'express';
import { HealthResponse } from '../../types';

export const healthRouter = Router();

/**
 * GET /health
 * Health check endpoint for Azure Container Apps probes
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  res.json(response);
});
