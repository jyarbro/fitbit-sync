/**
 * Fitbit OAuth authentication module.
 * @module backend/Auth/Fitbit
 */
import express from 'express';
import crypto from 'crypto';
import axios from 'axios';

/**
 * Fitbit OAuth authentication service.
 */
class AuthFitbit {
  constructor() {
    this.clientId = process.env.CLIENT_ID;
    this.clientSecret = process.env.CLIENT_SECRET;
    this.redirectUri = process.env.REDIRECT_URI;
    
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new Error('Fitbit OAuth configuration is incomplete. Please check CLIENT_ID, CLIENT_SECRET, and REDIRECT_URI environment variables.');
    }
    
    this.authUrl = 'https://www.fitbit.com/oauth2/authorize';
    this.tokenUrl = 'https://api.fitbit.com/oauth2/token';
  }

  /**
   * Generate OAuth state for CSRF protection.
   * @returns {string} Random state string
   */
  generateOAuthState() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate PKCE code verifier and challenge.
   * @returns {object} Code verifier and challenge
   */
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

  /**
   * Build Fitbit authorization URL with PKCE.
   * @param {string[]} scopes - OAuth scopes to request
   * @param {object} req - Express request object (for session storage)
   * @returns {object} Authorization URL and state information
   */
  buildAuthorizationURL(scopes = [], req = null) {
    const pkce = this.generatePKCE();
    const state = this.generateOAuthState();
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      code_challenge: pkce.codeChallenge,
      code_challenge_method: 'S256',
      scope: scopes.join(' '),
      state: state,
      redirect_uri: this.redirectUri
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
      url: `${this.authUrl}?${params.toString()}`,
      state: state,
      codeVerifier: pkce.codeVerifier
    };
  }

  /**
   * Retrieve stored OAuth state and code verifier.
   * @param {object} req - Express request object
   * @returns {object} Stored OAuth data
   */
  getStoredOAuthData(req = null) {
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
    
    return {
      state: storedState,
      codeVerifier: storedCodeVerifier
    };
  }

  /**
   * Validate OAuth state and code verifier.
   * @param {string} receivedState - State parameter from OAuth callback
   * @param {string} storedState - State stored during authorization
   * @param {string} receivedCodeVerifier - Code verifier from session/storage
   * @param {string} storedCodeVerifier - Code verifier stored during authorization
   */
  validateOAuthParameters(receivedState, storedState, receivedCodeVerifier, storedCodeVerifier) {
    // Validate state parameter
    if (storedState !== receivedState) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }
    
    // Validate code verifier matches
    if (storedCodeVerifier !== receivedCodeVerifier) {
      throw new Error('Invalid code verifier');
    }
  }

  /**
   * Exchange authorization code for access tokens.
   * @param {string} code - Authorization code from Fitbit
   * @param {string} codeVerifier - PKCE code verifier
   * @param {string} state - OAuth state parameter
   * @param {object} req - Express request object
   * @returns {object} Access token and user information
   */
  async exchangeCodeForTokens(code, codeVerifier, state, req = null) {
    const storedData = this.getStoredOAuthData(req);
    
    this.validateOAuthParameters(state, storedData.state, codeVerifier, storedData.codeVerifier);
    
    try {
      const response = await axios.post(this.tokenUrl, 
        new URLSearchParams({
          client_id: this.clientId,
          code: code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri
        }), {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      // Clean up any remaining temp storage
      delete this.tempStorage;

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        scope: response.data.scope,
        user_id: response.data.user_id
      };
    } catch (error) {
      console.error('Fitbit token exchange failed:', error.response?.data || error.message);
      throw new Error('Failed to exchange authorization code for Fitbit tokens: ' + (error.response?.data?.errors?.[0]?.message || error.message));
    }
  }

  /**
   * Refresh Fitbit access token using refresh token.
   * @param {string} refreshToken - Fitbit refresh token
   * @returns {object} New access token information
   */
  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post(this.tokenUrl, 
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }), {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        scope: response.data.scope,
        user_id: response.data.user_id
      };
    } catch (error) {
      console.error('Fitbit token refresh failed:', error.response?.data || error.message);
      throw new Error('Failed to refresh Fitbit access token: ' + (error.response?.data?.errors?.[0]?.message || error.message));
    }
  }

  /**
   * Create Fitbit authentication routes.
   * @param {object} params - Dependencies
   * @param {object} params.fitbitService - Fitbit API service
   * @param {object} params.db - Database service
   * @returns {express.Router}
   */
  createRoutes({ fitbitService, db }) {
    const router = express.Router();

    /**
     * Initiate Fitbit OAuth flow to refresh tokens.
     */
    router.get('/refreshtokens', (req, res) => {
      try {
        const scopes = fitbitService.scopes;
        const authData = this.buildAuthorizationURL(scopes, req);
        res.redirect(authData.url);
      } catch (error) {
        console.error('Fitbit OAuth initiation error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * Handle Fitbit OAuth callback.
     */
    router.get('/callback', async (req, res) => {
      try {
        const { code, state } = req.query;
        if (!code || !state) {
          return res.redirect('/callback.html?error=' + encodeURIComponent('Missing code or state in query parameters.'));
        }

        // Get codeVerifier from session or temp storage
        let codeVerifier = null;
        if (req.session?.oauthState) {
          codeVerifier = req.session.oauthState.codeVerifier;
        } else if (this.tempStorage) {
          codeVerifier = this.tempStorage.codeVerifier;
        }
        
        if (!codeVerifier) {
          return res.redirect('/callback.html?error=' + encodeURIComponent('Missing codeVerifier. Please restart the OAuth flow.'));
        }

        const tokens = await this.exchangeCodeForTokens(code, codeVerifier, state, req);
        await db.storeTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);

        // Redirect to callback page with success parameters
        const params = new URLSearchParams({
          success: 'true',
          userId: tokens.user_id,
          scopes: tokens.scope
        });
        res.redirect('/callback.html?' + params.toString());

        console.log(`Fitbit OAuth completed for user: ${tokens.user_id}`);
      } catch (error) {
        if (error.response) {
          console.error('Fitbit error response:', error.response.data);
        }
        console.error('OAuth GET /callback error:', error);
        
        const errorMessage = error.message + (error.response ? ' - ' + JSON.stringify(error.response.data) : '');
        res.redirect('/callback.html?error=' + encodeURIComponent('OAuth callback failed: ' + errorMessage));
      }
    });

    return router;
  }
}

export default AuthFitbit;
