import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';

export default function createAuthRoutes({ fitbitService, authService, db }) {
  const router = express.Router();

  router.get('/refreshtokens', (req, res) => {
    try {
      const scopes = fitbitService.scopes;
      const authData = authService.buildAuthorizationURL(scopes);
      res.redirect(authData.url);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code || !state) {
        return res.redirect('/callback.html?error=' + encodeURIComponent('Missing code or state in query parameters.'));
      }

      // Retrieve codeVerifier from temp storage (in-memory for now)
      const codeVerifier = authService.tempStorage?.codeVerifier;
      if (!codeVerifier) {
        return res.redirect('/callback.html?error=' + encodeURIComponent('Missing codeVerifier. Please restart the OAuth flow.'));
      }

      const tokens = await authService.exchangeCodeForTokens(code, codeVerifier, state);
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

  router.get('/newtoken', (req, res) => {
    const newToken = authService.generatePersonalJWT();
    res.json({
      personalJWT: newToken,
      expiresIn: '365 days',
      message: 'New personal JWT generated',
    });
  });

  const ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID;
  const ENTRA_CLIENT_SECRET = process.env.ENTRA_CLIENT_SECRET;
  const ENTRA_TENANT_ID = process.env.ENTRA_TENANT_ID;
  const ENTRA_REDIRECT_URI = process.env.ENTRA_REDIRECT_URI;
  const ENTRA_AUTH_URL = `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/oauth2/v2.0/authorize`;
  const ENTRA_TOKEN_URL = `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/oauth2/v2.0/token`;
  const ENTRA_SCOPE = 'openid profile email';

  router.get('/login', (req, res) => {
    const params = new URLSearchParams({
      client_id: ENTRA_CLIENT_ID,
      response_type: 'code',
      redirect_uri: ENTRA_REDIRECT_URI,
      response_mode: 'query',
      scope: ENTRA_SCOPE,
      state: 'entra_' + Math.random().toString(36).substring(2)
    });
    res.redirect(`${ENTRA_AUTH_URL}?${params.toString()}`);
  });

  router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({ error: 'Failed to logout' });
      }
      // Redirect to logout confirmation page instead of JSON response
      res.redirect('/logout.html');
    });
  });

  router.get('/entra-login', async (req, res) => {
    const { code, state } = req.query;
    if (!code) {
      return res.redirect('/callback.html?error=' + encodeURIComponent('Missing code from Microsoft Entra.'));
    }
    try {
      const tokenRes = await axios.post(ENTRA_TOKEN_URL, new URLSearchParams({
        client_id: ENTRA_CLIENT_ID,
        client_secret: ENTRA_CLIENT_SECRET,
        code,
        redirect_uri: ENTRA_REDIRECT_URI,
        grant_type: 'authorization_code',
        scope: ENTRA_SCOPE
      }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const idToken = tokenRes.data.id_token;
      const decoded = jwt.decode(idToken);

      req.session.user = {
        id: decoded.oid || decoded.sub,
        email: decoded.preferred_username || decoded.email,
        name: decoded.name,
        authenticated: true
      };

      // Redirect to callback page with success parameters for Microsoft login
      const params = new URLSearchParams({
        success: 'true',
        userId: decoded.preferred_username || decoded.email || 'Microsoft User',
        scopes: 'Microsoft Authentication'
      });
      res.redirect('/callback.html?' + params.toString());

      console.log(`Microsoft Entra login for: ${decoded.preferred_username || decoded.name}`);
    } catch (error) {
      console.error('Microsoft Entra callback error:', error.response?.data || error.message);
      res.redirect('/callback.html?error=' + encodeURIComponent('Microsoft Entra callback failed: ' + error.message));
    }
  });

  router.get('/auth-status', (req, res) => {
    if (!req.session?.user?.authenticated) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({
      authenticated: true,
      user: req.session.user
    });
  });

  return router;
}
