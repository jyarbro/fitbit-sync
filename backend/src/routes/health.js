/**
 * Health check endpoint for service monitoring.
 * @module backend/routes/health
 */
import express from 'express';

/**
 * Create health check routes for service monitoring.
 * @returns {express.Router} Express router with health endpoint.
 */
export default function createHealthRoutes() {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    });
  });

  return router;
}
