import express from 'express';

export default function createHealthRoutes() {
  const router = express.Router();

  router.get('/', (req, res) => {
    console.log('Health check received');
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    });
  });

  return router;
}
