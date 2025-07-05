import express, { json, urlencoded } from 'express';
import dotenv from 'dotenv';
import session from 'express-session';
import Database from './services/database.js';
import FitbitService from './services/fitbit-service.js';
import AuthService from './services/auth.js';
import createHealthRoutes from './routes/health.js';
import createRootRoutes from './routes/root.js';
import createApiRoutes from './routes/api.js';
import createAuthRoutes from './routes/auth.js';
import setupBackgroundSync from './services/scheduler.js';
import https from 'https';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Read TLS cert and key
const httpsOptions = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert')
};

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

app.use(session({
  secret: process.env.JWT_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

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
    https.createServer(httpsOptions, app).listen(PORT, () => {
      console.log(`HTTPS server running on https://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
