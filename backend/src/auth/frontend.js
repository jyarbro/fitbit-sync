/**
 * Frontend authentication module - JWT tokens and session management.
 * @module backend/Auth/Frontend
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * Frontend authentication service for JWT tokens and session management.
 */
class AuthFrontend {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    // Default token expiration (can be overridden by environment variables)
    this.tokenExpiration = process.env.JWT_EXPIRATION || '30d';
    this.refreshTokenExpiration = process.env.JWT_REFRESH_EXPIRATION || '90d';
  }

  /**
   * Generate personal JWT tokens for iOS shortcuts access.
   * @returns {object} Access token, refresh token, and expiration
   */
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
  
  /**
   * Helper to convert duration string to seconds.
   * @param {string} duration - Duration string (e.g., '30d', '1h')
   * @returns {number} Duration in seconds
   */
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
  
  /**
   * Generate a new access token from a refresh token.
   * @param {string} refreshToken - The refresh token
   * @returns {object} New access token and expiration
   */
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

  /**
   * Verify a JWT token.
   * @param {string} token - The JWT token to verify
   * @returns {object} Decoded token payload
   */
  verifyJWT(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Middleware to verify JWT tokens.
   * @returns {function} Express middleware function
   */
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

  /**
   * Check if user is authenticated via session.
   * @param {object} req - Express request object
   * @returns {boolean} Whether user is authenticated
   */
  isAuthenticated(req) {
    return req.session?.user?.authenticated === true;
  }

  /**
   * Get user information from session.
   * @param {object} req - Express request object
   * @returns {object|null} User information or null if not authenticated
   */
  getSessionUser(req) {
    return req.session?.user || null;
  }

  /**
   * Clear user session.
   * @param {object} req - Express request object
   * @param {function} callback - Callback function
   */
  clearSession(req, callback) {
    req.session.destroy(callback);
  }

  /**
   * Create frontend authentication routes.
   * @returns {express.Router}
   */
  createRoutes() {
    const router = express.Router();

    /**
     * Generate new JWT tokens for iOS shortcuts access.
     * Requires user to be authenticated via session.
     */
    router.get('/newtoken', (req, res) => {
      // Check for authentication before generating tokens
      if (!this.isAuthenticated(req)) {
        return res.status(401).json({ error: 'Authentication required to generate tokens' });
      }
      
      const tokens = this.generatePersonalJWT();
      res.json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        expiresInSeconds: tokens.expiresIn,
        message: 'New personal JWT tokens generated',
      });
    });
    
    /**
     * Refresh JWT access token using refresh token.
     */
    router.post('/refresh-token', (req, res) => {
      try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
          return res.status(400).json({ error: 'Refresh token is required' });
        }
        
        const newTokens = this.refreshJWT(refreshToken);
        res.json({
          accessToken: newTokens.accessToken,
          expiresIn: newTokens.expiresIn,
          expiresInSeconds: newTokens.expiresIn,
          message: 'Access token refreshed successfully',
        });
      } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({ error: error.message || 'Invalid refresh token' });
      }
    });

    /**
     * Check authentication status.
     */
    router.get('/auth-status', (req, res) => {
      if (!this.isAuthenticated(req)) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      res.json({
        authenticated: true,
        user: this.getSessionUser(req)
      });
    });

    /**
     * Logout user by destroying session.
     */
    router.get('/logout', (req, res) => {
      this.clearSession(req, (err) => {
        if (err) {
          console.error('Session destroy error:', err);
          return res.status(500).json({ error: 'Failed to logout' });
        }
        // Redirect to logout confirmation page instead of JSON response
        res.redirect('/logout.html');
      });
    });

    return router;
  }
}

export default AuthFrontend;
