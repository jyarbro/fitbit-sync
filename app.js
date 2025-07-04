import express, { json, urlencoded } from 'express';
import dotenv from 'dotenv';
import Database from './services/database.js';
import FitbitService from './services/fitbit-service.js';
import AuthService from './services/auth.js';
import createHealthRoutes from './routes/health.js';
import createRootRoutes from './routes/root.js';
import createApiRoutes from './routes/api.js';
import createAuthRoutes from './routes/auth.js';
import setupBackgroundSync from './services/scheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 80;

let db, fitbitService, authService;

async function initializeServices() {
  db = new Database();
  await db.initialize();
  fitbitService = new FitbitService(db);
  authService = new AuthService();
  app.use(authService.blockSensitiveFiles());
  app.use(authService.corsMiddleware());
  app.use(authService.createRateLimiter());
  console.log('Services initialized');
}

app.use(json());
app.use(urlencoded({ extended: true }));
app.set('trust proxy', 1);

app.use('/health', createHealthRoutes());
app.use('/', createRootRoutes());

function setupRoutes() {
  app.use('/auth', createAuthRoutes({ fitbitService, authService, db }));
  app.use('/api', createApiRoutes({ db, fitbitService, authService }));
}

function setupGracefulShutdown() {
  process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    if (db) db.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    if (db) db.close();
    process.exit(0);
  });
}

async function startServer() {
  try {
    await initializeServices();
    setupRoutes();
    setupBackgroundSync({ fitbitService, db });
    setupGracefulShutdown();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
