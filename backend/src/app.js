import express, { json, urlencoded } from 'express';
import dotenv from 'dotenv';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import FitbitService from './services/fitbit-service.js';
import AuthOrchestrator from './auth/orchestrator.js';
import SecurityMiddleware from './middleware/security.js';
import ValidationMiddleware from './middleware/validation.js';
import ErrorMiddleware from './middleware/error.js';
import createHealthRoutes from './routes/health.js';
import createRootRoutes from './routes/root.js';
import createApiRoutes from './routes/api.js';
import setupBackgroundSync from './services/scheduler.js';
import https from 'https';
import fs from 'fs';
import { DataService } from './data/index.js';

// Configure dotenv to look for .env file in the backend directory (for local development)
// In production, environment variables are provided by the platform
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');

// Only load .env file if JWT_SECRET is not already set (i.e., in local development)
if (!process.env.JWT_SECRET) {
  dotenv.config({ path: path.join(backendDir, '.env') });
}

// Entry point for backend server. Sets up Express app, security, session, routes, and HTTPS.
const app = express();
const PORT = process.env.PORT || 8080;

if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET environment variable is required');
  process.exit(1);
}

// Security headers for all responses
app.use((req, res, next) => {
  const scriptSrc = process.env.CSP_SCRIPT_SRC || "'self' 'unsafe-inline'";
  const styleSrc = process.env.CSP_STYLE_SRC || "'self' 'unsafe-inline'";
  const connectSrc = process.env.CSP_CONNECT_SRC || "'self' https://api.fitbit.com https://www.fitbit.com https://login.microsoftonline.com";
  const cspPolicy = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "form-action 'self' https://www.fitbit.com https://login.microsoftonline.com",
    "base-uri 'self'",
    "object-src 'none'"
  ].join('; ');
  res.setHeader('Content-Security-Policy', cspPolicy);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

let httpsOptions = null;
const isDevelopment = process.env.NODE_ENV !== 'production';

if (isDevelopment) {
  try {
    httpsOptions = {
      key: fs.readFileSync('server.key'),
      cert: fs.readFileSync('server.cert')
    };
    console.log('Using self-signed certificates for development');
  } catch (error) {
    console.error('ERROR: Could not read SSL certificates for development.');
    httpsOptions = null;
  }
}

let dataService, fitbitService, authOrchestrator, securityMiddleware, validationMiddleware, errorMiddleware;

// Initialize database and services
async function initializeServices() {
  // db = new Database();
  // await db.initialize();
  dataService = new DataService();
  await dataService.initialize();
  fitbitService = new FitbitService(dataService); // pass dataService instead of db
  authOrchestrator = new AuthOrchestrator();
  securityMiddleware = new SecurityMiddleware();
  validationMiddleware = new ValidationMiddleware();
  errorMiddleware = new ErrorMiddleware();
  
  app.use(securityMiddleware.blockSensitiveFiles());
  app.use(securityMiddleware.corsMiddleware());
  app.use(securityMiddleware.createRateLimiter());
}

app.use(json());
app.use(urlencoded({ extended: true }));
app.set('trust proxy', 1);

// Session configuration for secure cookies
app.use(session({
  secret: process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  name: '__Host-session',
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
  }
}));

// Track session creation time
app.use((req, res, next) => {
  if (req.session && !req.session.createdAt) {
    req.session.createdAt = Date.now();
  }
  next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../../frontend/public')));
app.use('/src', express.static(path.join(__dirname, '../../frontend/src')));

// Register API and auth routes
function setupRoutes() {
  app.use('/', createRootRoutes());
  app.use('/health', createHealthRoutes());
  app.use('/auth', authOrchestrator.createRoutes({ fitbitService, dataService })); // pass dataService instead of db
  app.use('/api', createApiRoutes({ 
    dataService, 
    fitbitService, 
    authFrontendService: authOrchestrator.getFrontendService(),
    validationMiddleware,
    errorMiddleware
  }));
}

// Handle graceful shutdown
function setupGracefulShutdown() {
  process.on('SIGINT', () => {
    if (dataService) dataService.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    if (dataService) dataService.close();
    process.exit(0);
  });
}

// Start server and background sync
async function startServer() {
  try {
    await initializeServices();
    setupRoutes();
    setupBackgroundSync({ fitbitService, dataService }); // pass dataService instead of db
    setupGracefulShutdown();
    if (isDevelopment) {
      if (httpsOptions) {
        https.createServer(httpsOptions, app).listen(PORT, () => {
          console.log(`HTTPS server running on port ${PORT}`);
        });
      } else {
        console.error('ERROR: HTTPS certificates are required for development but could not be loaded.');
        process.exit(1);
      }
    } else {
      // In production, DigitalOcean handles SSL termination, so we use HTTP
      app.listen(PORT, () => {
        console.log(`HTTP server running on port ${PORT}`);
      });
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
