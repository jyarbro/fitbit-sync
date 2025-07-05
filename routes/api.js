import express from 'express';

export default function createApiRoutes({ db, fitbitService, authService }) {
  const router = express.Router();

  // Combined authentication middleware - accepts either JWT or session
  router.use((req, res, next) => {
    // Check for JWT token first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Use JWT middleware
      return authService.verifyJWTMiddleware()(req, res, next);
    }
    
    // Check for session authentication
    if (req.session?.user?.authenticated) {
      return next();
    }
    
    // Neither authentication method is valid
    return res.status(401).json({ error: 'Authentication required - provide JWT token or valid session' });
  });

  router.use(authService.errorHandler());

  router.get('/samples', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 100;
      const typeFilter = req.query.type || null;
      const sortColumn = req.query.sort || 'created_at';
      const sortDirection = req.query.direction || 'desc';

      const result = await db.getSamplesPaginated(page, limit, typeFilter, sortColumn, sortDirection);
      res.json(result);
    } catch (error) {
      console.error('Samples API error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/sample-types', async (req, res) => {
    try {
      const types = await db.getSampleTypes();
      res.json({ types });
    } catch (error) {
      console.error('Sample types API error:', error);
      res.status(500).json({ error: error.message });
    }
  });

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
      
      // Log the full error details for debugging
      console.error('Full error object:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers
      });
      
      // Return detailed error information
      const errorResponse = {
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      // Include additional error details if available
      if (error.response) {
        errorResponse.httpStatus = error.response.status;
        errorResponse.responseData = error.response.data;
      }
      
      // Determine appropriate HTTP status code
      const statusCode = error.response?.status === 429 ? 429 : 
                        error.response?.status === 401 ? 401 : 
                        error.message.includes('Rate limit') ? 429 : 500;
      
      res.status(statusCode).json(errorResponse);
    }
  });

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

  return router;
}
