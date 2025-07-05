/**
 * Microsoft Entra ID authentication module.
 * @module backend/Auth/Microsoft
 */
import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';

/**
 * Microsoft Entra ID authentication service.
 */
class AuthMicrosoft {
  constructor() {
    this.clientId = process.env.ENTRA_CLIENT_ID;
    this.clientSecret = process.env.ENTRA_CLIENT_SECRET;
    this.tenantId = process.env.ENTRA_TENANT_ID;
    this.redirectUri = process.env.ENTRA_REDIRECT_URI;
    this.scope = 'openid profile email';
    
    if (!this.clientId || !this.clientSecret || !this.tenantId || !this.redirectUri) {
      throw new Error('Microsoft Entra configuration is incomplete. Please check ENTRA_* environment variables.');
    }
    
    this.authUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize`;
    this.tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
  }

  /**
   * Generate Microsoft OAuth authorization URL.
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl() {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: this.scope,
      state: 'entra_' + Math.random().toString(36).substring(2)
    });
    
    return `${this.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens and user info.
   * @param {string} code - Authorization code from Microsoft
   * @returns {object} User information and tokens
   */
  async exchangeCodeForTokens(code) {
    try {
      const tokenResponse = await axios.post(this.tokenUrl, new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
        scope: this.scope
      }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const idToken = tokenResponse.data.id_token;
      const decoded = jwt.decode(idToken);

      if (!decoded) {
        throw new Error('Failed to decode ID token from Microsoft');
      }

      return {
        user: {
          id: decoded.oid || decoded.sub,
          email: decoded.preferred_username || decoded.email,
          name: decoded.name,
          authenticated: true
        },
        tokens: tokenResponse.data
      };
    } catch (error) {
      console.error('Microsoft token exchange error:', error.response?.data || error.message);
      throw new Error('Microsoft authentication failed: ' + (error.response?.data?.error_description || error.message));
    }
  }

  /**
   * Set user session after successful authentication.
   * @param {object} req - Express request object
   * @param {object} user - User information
   */
  setUserSession(req, user) {
    req.session.user = user;
    
    // Ensure session creation timestamp is set
    if (!req.session.createdAt) {
      req.session.createdAt = Date.now();
    }
  }

  /**
   * Validate Microsoft OAuth state parameter.
   * @param {string} state - State parameter from OAuth callback
   * @returns {boolean} Whether state is valid
   */
  validateState(state) {
    return state && state.startsWith('entra_');
  }

  /**
   * Create Microsoft authentication routes.
   * @returns {express.Router}
   */
  createRoutes() {
    const router = express.Router();

    /**
     * Initiate Microsoft Entra ID login.
     */
    router.get('/login', (req, res) => {
      try {
        const authUrl = this.getAuthorizationUrl();
        res.redirect(authUrl);
      } catch (error) {
        console.error('Microsoft login initiation error:', error);
        res.redirect('/callback.html?error=' + encodeURIComponent('Failed to initiate Microsoft login: ' + error.message));
      }
    });

    /**
     * Handle Microsoft Entra ID OAuth callback.
     */
    router.get('/entra-login', async (req, res) => {
      const { code, state } = req.query;
      
      if (!code) {
        return res.redirect('/callback.html?error=' + encodeURIComponent('Missing code from Microsoft Entra.'));
      }

      if (!this.validateState(state)) {
        return res.redirect('/callback.html?error=' + encodeURIComponent('Invalid state parameter from Microsoft.'));
      }

      try {
        const authResult = await this.exchangeCodeForTokens(code);
        
        // Set user session
        this.setUserSession(req, authResult.user);

        // Redirect to callback page with success parameters for Microsoft login
        const params = new URLSearchParams({
          success: 'true',
          userId: authResult.user.email || authResult.user.name || 'Microsoft User',
          scopes: 'Microsoft Authentication'
        });
        res.redirect('/callback.html?' + params.toString());

        console.log(`Microsoft Entra login for: ${authResult.user.email || authResult.user.name}`);
      } catch (error) {
        console.error('Microsoft Entra callback error:', error.message);
        res.redirect('/callback.html?error=' + encodeURIComponent('Microsoft Entra callback failed: ' + error.message));
      }
    });

    return router;
  }
}

export default AuthMicrosoft;
