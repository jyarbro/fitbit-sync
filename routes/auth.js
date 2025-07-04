import express from 'express';

export default function createAuthRoutes({ fitbitService, authService, db }) {
  const router = express.Router();

  // OAuth flow endpoints
  router.get('/start', (req, res) => {
    try {
      const scopes = fitbitService.scopes;
      const authData = authService.buildAuthorizationURL(scopes);
      res.json({
        message: 'Visit the authorization URL to grant access',
        authorizationURL: authData.url,
        instructions: [
          '1. Visit the authorization URL',
          '2. Grant access to your Fitbit data',
          '3. Copy the authorization code from the callback URL',
          '4. Use the code with /auth/callback endpoint',
        ],
        scopes,
        state: authData.state,
        codeVerifier: authData.codeVerifier,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/callback', async (req, res) => {
    try {
      const { code, state, codeVerifier } = req.body;
      if (!code || !state || !codeVerifier) {
        return res.status(400).json({
          error: 'Missing required parameters: code, state, codeVerifier',
        });
      }
      const tokens = await authService.exchangeCodeForTokens(code, codeVerifier, state);
      await db.storeTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);
      const personalJWT = authService.generatePersonalJWT();
      res.json({
        message: 'OAuth flow completed successfully',
        user_id: tokens.user_id,
        scopes: tokens.scope,
        personalJWT,
        instructions: [
          'Save the personalJWT token for API access',
          'Use it in Authorization header: Bearer <token>',
          'The token is valid for 1 year',
        ],
      });
      console.log(`OAuth completed for user: ${tokens.user_id}`);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // OAuth callback endpoint for Fitbit redirect
  router.get('/authorize', async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code || !state) {
        return res.status(400).send('Missing code or state in query parameters.');
      }
      // Retrieve codeVerifier from temp storage (in-memory for now)
      const codeVerifier = authService.tempStorage?.codeVerifier;
      if (!codeVerifier) {
        return res.status(400).send('Missing codeVerifier. Please restart the OAuth flow.');
      }
      const tokens = await authService.exchangeCodeForTokens(code, codeVerifier, state);
      await db.storeTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);
      const personalJWT = authService.generatePersonalJWT();
      res.send(
        `<h2>OAuth flow completed successfully!</h2>` +
        `<p>User ID: ${tokens.user_id}</p>` +
        `<p>Scopes: ${tokens.scope}</p>` +
        `<p>Your personalJWT (save this for API access):</p>` +
        `<pre>${personalJWT}</pre>` +
        `<p>Use it in the Authorization header: <code>Bearer &lt;token&gt;</code></p>` +
        `<p>The token is valid for 1 year.</p>`
      );
      console.log(`OAuth completed for user: ${tokens.user_id}`);
    } catch (error) {
      console.error('OAuth GET /authorize error:', error);
      res.status(400).send('OAuth callback failed: ' + error.message);
    }
  });

  return router;
}
