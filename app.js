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

// Ensure JWT_SECRET is set
if (!process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET environment variable is required');
  process.exit(1);
}

// Security headers middleware
app.use((req, res, next) => {
  // Content Security Policy - configurable via environment variables
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
    "frame-ancestors 'none'", // Prevent clickjacking
    "form-action 'self' https://www.fitbit.com https://login.microsoftonline.com",
    "base-uri 'self'",
    "object-src 'none'"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', cspPolicy);
  
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevent MIME type sniffing
  res.setHeader('X-Frame-Options', 'DENY'); // Prevent clickjacking
  res.setHeader('X-XSS-Protection', '1; mode=block'); // XSS protection
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); // Control referrer information
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); // Restrict browser features
  
  // HSTS (HTTP Strict Transport Security) - only for HTTPS
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  next();
});

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
  secret: process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  name: '__Host-session', // Use secure cookie prefix
  cookie: {
    secure: true, // Always require HTTPS
    httpOnly: true,
    sameSite: 'strict', // Prevent CSRF attacks
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/'
  }
}));

app.use((req, res, next) => {
  if (req.session && !req.session.createdAt) {
    req.session.createdAt = Date.now();
  }
  next();
});

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
