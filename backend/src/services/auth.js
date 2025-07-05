/**
 * Service for authentication, JWT, and OAuth logic.
 * @module backend/services/auth
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import axios from 'axios';

/**
 * Authentication, JWT, and OAuth logic for Fitbit Sync.
 */
class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    // Default token expiration (can be overridden by environment variables)
    this.tokenExpiration = process.env.JWT_EXPIRATION || '30d';
    this.refreshTokenExpiration = process.env.JWT_REFRESH_EXPIRATION || '90d';
  }

  generatePersonalJWT() {
    const tokenId = crypto.randomBytes(16).toString('hex');
    const payload = {
      userId: 'personal-fitbit-sync',
      purpose: 'ios-shortcuts-access',
      iat: Math.floor(Date.now() / 1000),
      jti: tokenId // JWT ID for potential revocation
    };
    
    // Generate a refresh token as well
    const refreshTokenId = crypto.randomBytes(16).toString('hex');
    const refreshPayload = {
      userId: 'personal-fitbit-sync',
      purpose: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      jti: refreshTokenId,
      tokenId: tokenId // Link to the access token
    };
    
    const accessToken = jwt.sign(payload, this.jwtSecret, { 
      expiresIn: this.tokenExpiration,
      issuer: 'fitbit-sync-personal'
    });
    
    const refreshToken = jwt.sign(refreshPayload, this.jwtSecret, { 
      expiresIn: this.refreshTokenExpiration,
      issuer: 'fitbit-sync-personal'
    });
    
    return {
      accessToken,
      refreshToken,
      expiresIn: this.getExpirationSeconds(this.tokenExpiration)
    };
  }
  
  // Helper to convert duration string to seconds
  getExpirationSeconds(duration) {
    const unit = duration.slice(-1);
    const value = parseInt(duration.slice(0, -1));
    
    switch(unit) {
      case 'd': return value * 24 * 60 * 60;
      case 'h': return value * 60 * 60;
      case 'm': return value * 60;
      case 's': return value;
      default: return 30 * 24 * 60 * 60; // default to 30 days
    }
  }
  
  // Generate a new access token from a refresh token
  refreshJWT(refreshToken) {
    try {
      const decoded = this.verifyJWT(refreshToken);
      
      // Verify this is actually a refresh token
      if (decoded.purpose !== 'refresh') {
        throw new Error('Invalid token type');
      }
      
      // Generate a new access token
      const tokenId = crypto.randomBytes(16).toString('hex');
      const payload = {
        userId: decoded.userId,
        purpose: 'ios-shortcuts-access',
        iat: Math.floor(Date.now() / 1000),
        jti: tokenId
      };
      
      const accessToken = jwt.sign(payload, this.jwtSecret, { 
        expiresIn: this.tokenExpiration,
        issuer: 'fitbit-sync-personal'
      });
      
      return {
        accessToken,
        expiresIn: this.getExpirationSeconds(this.tokenExpiration)
      };
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  verifyJWT(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

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

  // For CSRF protection
  generateOAuthState() {
    return crypto.randomBytes(32).toString('hex');
  }

  // PKCE code verifier and challenge
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

  buildAuthorizationURL(scopes = [], req = null) {
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

    // Store OAuth state in session if available, otherwise fall back to in-memory
    if (req && req.session) {
      req.session.oauthState = {
        codeVerifier: pkce.codeVerifier,
        state: state,
        timestamp: Date.now()
      };
    } else {
      // Fallback to in-memory storage with timestamp for cleanup
      this.tempStorage = { 
        codeVerifier: pkce.codeVerifier, 
        state: state,
        timestamp: Date.now()
      };
    }

    return {
      url: `https://www.fitbit.com/oauth2/authorize?${params.toString()}`,
      state: state,
      codeVerifier: pkce.codeVerifier
    };
  }

  async exchangeCodeForTokens(code, codeVerifier, state, req = null) {
    let storedState = null;
    let storedCodeVerifier = null;
    
    // Try to get state from session first, then fallback to in-memory
    if (req && req.session?.oauthState) {
      const oauthData = req.session.oauthState;
      storedState = oauthData.state;
      storedCodeVerifier = oauthData.codeVerifier;
      
      // Check if the OAuth data is not too old (max 10 minutes)
      const age = Date.now() - oauthData.timestamp;
      if (age > 10 * 60 * 1000) {
        delete req.session.oauthState;
        throw new Error('OAuth state expired, please restart the authorization flow');
      }
      
      // Clean up session data
      delete req.session.oauthState;
    } else if (this.tempStorage) {
      storedState = this.tempStorage.state;
      storedCodeVerifier = this.tempStorage.codeVerifier;
      
      // Check if the OAuth data is not too old (max 10 minutes)
      const age = Date.now() - this.tempStorage.timestamp;
      if (age > 10 * 60 * 1000) {
        delete this.tempStorage;
        throw new Error('OAuth state expired, please restart the authorization flow');
      }
      
      delete this.tempStorage;
    } else {
      throw new Error('No OAuth state found, please restart the authorization flow');
    }
    
    // Validate state parameter
    if (storedState !== state) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }
    
    // Validate code verifier matches
    if (storedCodeVerifier !== codeVerifier) {
      throw new Error('Invalid code verifier');
    }
    
    try {
      const response = await axios.post('https://api.fitbit.com/oauth2/token', 
        new URLSearchParams({
          client_id: process.env.CLIENT_ID,
          code: code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: process.env.REDIRECT_URI
        }), {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

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

  blockSensitiveFiles() {
    return (req, res, next) => {
      if (req.path.match(/\.(db|sqlite|sqlite3|env|log)$/i)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    };
  }

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

  errorHandler() {
    return (error, req, res, next) => {
      // Log the error for server-side debugging
      console.error('API Error:', error);
      
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
      
      if (error.response) {
        console.error('Response error data:', {
          status: error.response.status,
          headers: error.response.headers,
          data: error.response.data
        });
      }
      
      const isDevelopment = process.env.NODE_ENV === 'development';
      const errorId = crypto.randomBytes(8).toString('hex'); // For tracking errors
      
      // Determine error type and appropriate status code
      let statusCode = 500;
      let publicErrorMessage = 'Internal server error';
      
      // Map common errors to appropriate HTTP status codes and user-friendly messages
      if (error.message.includes('Rate limit')) {
        statusCode = 429;
        
        // Try to extract detailed rate limit info from the error message (multiple patterns)
        let detailedRateLimitMatch = error.message.match(/Used (\d+)\/(\d+) requests\. (\d+) remaining\. Resets in (\d+) seconds/);
        
        if (detailedRateLimitMatch) {
          const [, used, total, remaining, resetTime] = detailedRateLimitMatch;
          const resetDate = new Date(Date.now() + parseInt(resetTime) * 1000);
          publicErrorMessage = `Rate limit exceeded: ${used}/${total} requests used, ${remaining} remaining. Resets in ${resetTime} seconds (${resetDate.toLocaleString()})`;
          
          console.error(`🚫 Enhanced rate limit error logged [${errorId}]:`, {
            used: parseInt(used),
            total: parseInt(total),
            remaining: parseInt(remaining),
            resetTime: parseInt(resetTime),
            resetDate: resetDate.toISOString()
          });
        } else {
          // Try alternative patterns
          const simpleLimitMatch = error.message.match(/Rate limit too low: (\d+) requests remaining.*?resets in (\d+) seconds at (.+)/);
          const rangeLimitMatch = error.message.match(/Rate limit too low: (\d+) requests remaining, need approximately (\d+).*?resets in (\d+) seconds at (.+)/);
          
          if (rangeLimitMatch) {
            const [, remaining, needed, resetTime, resetDateStr] = rangeLimitMatch;
            const resetDate = new Date(resetDateStr);
            publicErrorMessage = `Rate limit too low: ${remaining} requests remaining, need ${needed}. Resets in ${resetTime} seconds (${resetDate.toLocaleString()})`;
            
            console.error(`🚫 Enhanced rate limit error logged [${errorId}]:`, {
              used: 150 - parseInt(remaining),
              total: 150,
              remaining: parseInt(remaining),
              needed: parseInt(needed),
              resetTime: parseInt(resetTime),
              resetDate: resetDate.toISOString()
            });
          } else if (simpleLimitMatch) {
            const [, remaining, resetTime, resetDateStr] = simpleLimitMatch;
            const resetDate = new Date(resetDateStr);
            publicErrorMessage = `Rate limit too low: ${remaining} requests remaining (need at least 10). Resets in ${resetTime} seconds (${resetDate.toLocaleString()})`;
            
            console.error(`🚫 Enhanced rate limit error logged [${errorId}]:`, {
              used: 150 - parseInt(remaining),
              total: 150,
              remaining: parseInt(remaining),
              resetTime: parseInt(resetTime),
              resetDate: resetDate.toISOString()
            });
          } else {
            publicErrorMessage = 'Rate limit exceeded, please try again later';
          }
        }
      } else if (error.message.includes('No tokens') || error.message.includes('Invalid token') || 
                error.message.includes('expired token') || error.message.includes('Authentication required')) {
        statusCode = 401;
        publicErrorMessage = 'Authentication required or credentials expired';
      } else if (error.message.includes('Not found') || error.message.includes('does not exist')) {
        statusCode = 404;
        publicErrorMessage = 'Requested resource not found';
      } else if (error.message.includes('Permission') || error.message.includes('Forbidden')) {
        statusCode = 403;
        publicErrorMessage = 'You do not have permission to access this resource';
      } else if (error.message.includes('Invalid') || error.message.includes('Missing required') || 
                error.message.includes('validation')) {
        statusCode = 400;
        publicErrorMessage = 'Invalid request parameters';
      }
      
      // Use status code from the response if available
      if (error.response?.status) {
        statusCode = error.response.status;
      }
      
      // Create a sanitized error response
      const errorResponse = {
        error: publicErrorMessage,
        errorId: errorId,
        timestamp: new Date().toISOString()
      };
      
      // Only add detailed error information in development
      if (isDevelopment) {
        errorResponse.devMessage = error.message;
        
        if (error.response?.data) {
          // Still sanitize the response data to avoid leaking sensitive info
          const safeResponseData = { ...error.response.data };
          
          // Remove potential sensitive fields
          delete safeResponseData.stack;
          delete safeResponseData.trace;
          delete safeResponseData.password;
          delete safeResponseData.token;
          delete safeResponseData.secret;
          
          errorResponse.responseData = safeResponseData;
        }
      }
      
      res.status(statusCode).json(errorResponse);
    };
  }

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

export default AuthService;
