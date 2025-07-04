import express from 'express';

export default function createApiRoutes({ db, fitbitService, authService }) {
  const router = express.Router();

  // Protected API endpoints
  router.use(authService.verifyJWTMiddleware());

  // Get personal JWT token (if you lose it)
  router.get('/auth/token', (req, res) => {
    const newToken = authService.generatePersonalJWT();
    res.json({
      personalJWT: newToken,
      expiresIn: '365 days',
      message: 'New personal JWT generated',
    });
  });

  // Main sync endpoint for iOS Shortcuts
  router.post('/sync', authService.validateSyncRequest(), async (req, res) => {
    try {
      const { lastSyncTimestamp } = req.body;
      console.log(`Sync request received. Last sync: ${lastSyncTimestamp}`);
      const samples = await db.getSamplesSince(lastSyncTimestamp);
      const now = new Date();
      const newLastSyncTimestamp = now.toISOString();
      res.json({
        samples,
        newLastSyncTimestamp,
        count: samples.length,
        syncTime: newLastSyncTimestamp,
      });
      console.log(`Sync completed: ${samples.length} samples returned`);
    } catch (error) {
      console.error('Sync error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Manual sync trigger
  router.post('/sync/trigger', async (req, res) => {
    try {
      console.log('Manual sync triggered');
      const results = await fitbitService.syncAllData();
      res.json({
        message: 'Manual sync completed',
        results,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Manual sync error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get sync status
  router.get('/status', async (req, res) => {
    try {
      const rateLimitStatus = await db.getRateLimitStatus();
      const tokens = await db.getTokens();
      res.json({
        rateLimit: rateLimitStatus,
        tokenExpiry: tokens ? new Date(tokens.expires_at).toISOString() : null,
        scopes: fitbitService.scopes,
        lastSync: {
          activity: await db.getLatestSyncTime('activity'),
          heartrate: await db.getLatestSyncTime('heartrate'),
          sleep: await db.getLatestSyncTime('sleep'),
          other: await db.getLatestSyncTime('other_health_data'),
        },
      });
    } catch (error) {
      console.error('Status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Error handling middleware
  router.use(authService.errorHandler());

  return router;
}
