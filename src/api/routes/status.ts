import { Router, Request, Response } from 'express';
import { getState } from '../../state';
import { StatusResponse } from '../../types';

export const statusRouter = Router();

/**
 * GET /api/status
 * Returns current server status
 */
statusRouter.get('/status', (_req: Request, res: Response) => {
  const state = getState();

  const response: StatusResponse = {
    status: state.status,
    lastUpdated: state.lastUpdated,
    maintenance: state.maintenance,
  };

  res.json(response);
});
