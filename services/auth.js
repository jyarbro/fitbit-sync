const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }

  // Generate a long-lived JWT for personal use
  generatePersonalJWT() {
    const payload = {
      userId: 'personal-fitbit-sync',
      purpose: 'ios-shortcuts-access',
      iat: Math.floor(Date.now() / 1000)
    };
    
    // Long expiration (1 year) since it's just for personal use
    return jwt.sign(payload, this.jwtSecret, { 
      expiresIn: '365d',
      issuer: 'fitbit-sync-personal'
    });
  }

  // Verify JWT token
  verifyJWT(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  // Middleware to verify JWT
  verifyJWTMiddleware() {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }
      
      const token = authHeader.replace('Bearer ', '');
      
      try {
        const decoded = this.verifyJWT(token);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    };
  }

  // Generate OAuth state parameter for CSRF protection
  generateOAuthState() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Generate PKCE code verifier and challenge
  generatePKCE() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    return {
      codeVerifier,
      codeChallenge
    };
  }

  // Build Fitbit authorization URL
  buildAuthorizationURL(scopes = []) {
    const pkce = this.generatePKCE();
    const state = this.generateOAuthState();
    
    const params = new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      response_type: 'code',
      code_challenge: pkce.codeChallenge,
      code_challenge_method: 'S256',
      scope: scopes.join(' '),
      state: state,
      redirect_uri: process.env.REDIRECT_URI
    });

    // Store PKCE and state for later verification (in production, use Redis or database)
    this.tempStorage = { 
      codeVerifier: pkce.codeVerifier, 
      state: state 
    };

    return {
      url: `https://www.fitbit.com/oauth2/authorize?${params.toString()}`,
      state: state,
      codeVerifier: pkce.codeVerifier
    };
  }

  // Exchange authorization code for tokens
  async exchangeCodeForTokens(code, codeVerifier, state) {
    // Verify state parameter (CSRF protection)
    if (this.tempStorage?.state !== state) {
      throw new Error('Invalid state parameter');
    }

    const axios = require('axios');
    
    try {
      const response = await axios.post('https://api.fitbit.com/oauth2/token', 
        new URLSearchParams({
          client_id: process.env.CLIENT_ID,
          code: code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code'
        }), {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      // Clean up temporary storage
      delete this.tempStorage;

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        scope: response.data.scope,
        user_id: response.data.user_id
      };
    } catch (error) {
      console.error('Token exchange failed:', error.response?.data || error.message);
      throw new Error('Failed to exchange authorization code for tokens');
    }
  }

  // Security middleware to block sensitive files
  blockSensitiveFiles() {
    return (req, res, next) => {
      // Block database files and other sensitive files
      if (req.path.match(/\.(db|sqlite|sqlite3|env|log)$/i)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    };
  }

  // Rate limiting middleware (simple in-memory implementation)
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
      
      // Check current IP
      const clientRequests = requests.get(clientIP) || [];
      const recentRequests = clientRequests.filter(time => time > windowStart);
      
      if (recentRequests.length >= max) {
        return res.status(429).json({ 
          error: 'Too many requests',
          retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
        });
      }
      
      // Add current request
      recentRequests.push(now);
      requests.set(clientIP, recentRequests);
      
      next();
    };
  }

  // Input validation middleware
  validateSyncRequest() {
    return (req, res, next) => {
      const { lastSyncTimestamp } = req.body;
      
      if (!lastSyncTimestamp) {
        return res.status(400).json({ 
          error: 'lastSyncTimestamp is required' 
        });
      }
      
      // Validate ISO 8601 format
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
      if (!isoRegex.test(lastSyncTimestamp)) {
        return res.status(400).json({ 
          error: 'lastSyncTimestamp must be in ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)' 
        });
      }
      
      // Validate timestamp is not in the future
      const timestamp = new Date(lastSyncTimestamp);
      if (timestamp > new Date()) {
        return res.status(400).json({ 
          error: 'lastSyncTimestamp cannot be in the future' 
        });
      }
      
      next();
    };
  }

  // Error handling middleware
  errorHandler() {
    return (error, req, res, next) => {
      console.error('API Error:', error);
      
      // Don't expose internal errors in production
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      if (error.message.includes('Rate limit exceeded')) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded',
          message: isDevelopment ? error.message : 'Please try again later'
        });
      }
      
      if (error.message.includes('No tokens found')) {
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'Please complete OAuth flow first'
        });
      }
      
      // Generic error response
      res.status(500).json({ 
        error: 'Internal server error',
        message: isDevelopment ? error.message : 'Something went wrong'
      });
    };
  }

  // CORS middleware for development
  corsMiddleware() {
    return (req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    };
  }
}

module.exports = AuthService;
