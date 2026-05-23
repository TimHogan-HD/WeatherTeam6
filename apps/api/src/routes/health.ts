import { Router, type Request, type Response } from 'express';

export const healthRouter: Router = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    data: { status: 'ok' },
    error: null,
    status: 200,
  });
});
