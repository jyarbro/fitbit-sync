/**
 * Root routes for serving static files and main landing page.
 * @module backend/routes/root
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create root routes.
 * @returns {express.Router}
 */
export default function createRootRoutes() {
  const router = express.Router();
  router.use(express.static(path.join(__dirname, '../public')));
  router.get('/', (req, res) => {
    if (!req.session?.user?.authenticated) {
      return res.sendFile(path.join(__dirname, '../public/login.html'));
    }
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  return router;
}
