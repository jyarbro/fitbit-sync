import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function createRootRoutes() {
  const router = express.Router();

  // Serve static files from public directory
  router.use(express.static(path.join(__dirname, '../public')));

  // Main landing page route
  router.get('/', (req, res) => {
    // Check if user is authenticated via session
    if (!req.session?.user?.authenticated) {
      // Serve the login page instead of redirecting directly
      return res.sendFile(path.join(__dirname, '../public/login.html'));
    }

    // Serve the landing page
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  return router;
}
