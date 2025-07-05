/**
 * Security middleware for the application.
 * @module backend/middleware/security
 */
import crypto from 'crypto';

/**
 * Security middleware service.
 */
class SecurityMiddleware {
  /**
   * Middleware to block access to sensitive files.
   * @returns {function} Express middleware function
   */
  blockSensitiveFiles() {
    return (req, res, next) => {
      if (req.path.match(/\.(db|sqlite|sqlite3|env|log)$/i)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    };
  }

  /**
   * Create a rate limiter middleware.
   * @param {number} windowMs - Time window in milliseconds
   * @param {number} max - Maximum requests per window
   * @returns {function} Express middleware function
   */
  createRateLimiter(windowMs = 15 * 60 * 1000, max = 100) {
    const requests = new Map();
    
    return (req, res, next) => {
      const clientIP = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Clean old entries
      for (const [ip, timestamps] of requests.entries()) {
        const validTimestamps = timestamps.filter(time => time > windowStart);
        if (validTimestamps.length === 0) {
          requests.delete(ip);
        } else {
          requests.set(ip, validTimestamps);
        }
      }
      
      const clientRequests = requests.get(clientIP) || [];
      const recentRequests = clientRequests.filter(time => time > windowStart);
      
      if (recentRequests.length >= max) {
        return res.status(429).json({ 
          error: 'Too many requests',
          retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
        });
      }
      
      recentRequests.push(now);
      requests.set(clientIP, recentRequests);
      
      next();
    };
  }

  /**
   * CORS middleware.
   * @returns {function} Express middleware function
   */
  corsMiddleware() {
    return (req, res, next) => {
      // Get allowed origins from environment variable or use localhost as default for development
      const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
        process.env.ALLOWED_ORIGINS.split(',') : 
        ['https://localhost:8080'];
        
      const origin = req.headers.origin;
      
      // Only set CORS headers if the origin is in our allowed list
      if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        res.header('Access-Control-Allow-Credentials', 'true'); // Allow credentials
      }
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    };
  }
}

export default SecurityMiddleware;
