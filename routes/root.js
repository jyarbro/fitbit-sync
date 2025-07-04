import express from 'express';

export default function createRootRoutes() {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.status(200).json({
      message: 'Fitbit Sync API is running',
      version: '0.1.0',
      endpoints: {
        health: '/health',
        auth: '/auth/start',
        sync: '/api/sync (POST with JWT)',
        token: '/auth/token (GET with JWT)'
      }
    });
  });

  return router;
}
