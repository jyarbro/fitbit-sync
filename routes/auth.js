import express from 'express';

export default function createAuthRoutes({ fitbitService, authService, db }) {
  const router = express.Router();

  // OAuth flow endpoints
  router.get('/start', (req, res) => {
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
        `<p>Save this personal token for API access from iOS:</p>` +
        `<pre>${personalJWT}</pre>` +
        `<p>Use it in the Authorization header: <code>Bearer &lt;token&gt;</code></p>` +
        `<p>The token is valid for 1 year.</p>`
      );

      console.log(`OAuth completed for user: ${tokens.user_id}`);
    } catch (error) {
      console.error('OAuth GET /callback error:', error);
      res.status(400).send('OAuth callback failed: ' + error.message);
    }
  });

  return router;
}
