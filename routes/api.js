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
    
    // Check for session authentication with enhanced security
    if (req.session?.user?.authenticated) {
      // Additional checks to ensure session is valid
      const sessionUser = req.session.user;
      
      // Verify session has required user properties
      if (!sessionUser.id || !sessionUser.email) {
        return res.status(401).json({ error: 'Invalid session structure' });
      }
      
      // Check session age to ensure it's not too old (optional additional check)
      const sessionCreatedAt = req.session.createdAt || Date.now();
      const sessionAge = Date.now() - sessionCreatedAt;
      const maxSessionAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
      
      if (sessionAge > maxSessionAge) {
        req.session.destroy();
        return res.status(401).json({ error: 'Session expired, please login again' });
      }
      
      // Session is valid, proceed
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
      const { date, startDate, endDate, sampleTypes } = req.body;
      
      let results;
      let message;
      
      if (startDate && endDate) {
        console.log(`Manual date range sync triggered: ${startDate} to ${endDate}`, sampleTypes ? `for sample types: ${sampleTypes.join(', ')}` : 'for all sample types');
        results = await fitbitService.syncDateRange(startDate, endDate, sampleTypes);
        message = `Date range sync completed for ${startDate} to ${endDate}`;
      } else if (date) {
        console.log(`Manual date sync triggered for: ${date}`, sampleTypes ? `for sample types: ${sampleTypes.join(', ')}` : 'for all sample types');
        results = await fitbitService.syncAllData(date, sampleTypes);
        message = `Date sync completed for ${date}`;
      } else {
        console.log('Manual sync triggered', sampleTypes ? `for sample types: ${sampleTypes.join(', ')}` : 'for all sample types');
        results = await fitbitService.syncAllData(null, sampleTypes);
        message = 'Manual sync completed';
      }
      
      res.json({
        message,
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
      
      // Return sanitized error information based on environment
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      // Create a safe error response that doesn't expose sensitive information
      const errorResponse = {
        error: 'Error processing request',
        timestamp: new Date().toISOString()
      };
      
      // Add more information only in development mode
      if (isDevelopment) {
        errorResponse.message = error.message;
        
        // Only include basic status information from response, not full data
        if (error.response) {
          errorResponse.httpStatus = error.response.status;
          
          // Include safe error types but not detailed data
          if (error.response.data?.errors) {
            errorResponse.errorTypes = Array.isArray(error.response.data.errors) ? 
              error.response.data.errors.map(e => e.type || e.code) : 
              [error.response.data.errors.type || error.response.data.errors.code];
          }
        }
      }
      
      // Determine appropriate HTTP status code
      const statusCode = error.response?.status === 429 ? 429 : 
                        error.response?.status === 401 ? 401 : 
                        error.message.includes('Rate limit') ? 429 : 500;
      
      // Add user-friendly message with detailed rate limit info
      if (statusCode === 429) {
        // Try to extract rate limit details from the error message (multiple patterns)
        let rateLimitMatch = error.message.match(/Used (\d+)\/(\d+) requests\. (\d+) remaining\. Resets in (\d+) seconds/);
        
        if (rateLimitMatch) {
          const [, used, total, remaining, resetTime] = rateLimitMatch;
          const resetDate = new Date(Date.now() + parseInt(resetTime) * 1000);
          errorResponse.error = `Rate limit exceeded: ${used}/${total} requests used, ${remaining} remaining. Resets in ${resetTime} seconds (${resetDate.toLocaleString()})`;
          errorResponse.rateLimitInfo = {
            used: parseInt(used),
            total: parseInt(total),
            remaining: parseInt(remaining),
            resetTime: parseInt(resetTime),
            resetDate: resetDate.toISOString()
          };
        } else {
          // Try alternative patterns for other rate limit errors
          const simpleLimitMatch = error.message.match(/Rate limit too low: (\d+) requests remaining.*?resets in (\d+) seconds at (.+)/);
          const rangeLimitMatch = error.message.match(/Rate limit too low: (\d+) requests remaining, need approximately (\d+).*?resets in (\d+) seconds at (.+)/);
          
          if (rangeLimitMatch) {
            const [, remaining, needed, resetTime, resetDateStr] = rangeLimitMatch;
            const resetDate = new Date(resetDateStr);
            errorResponse.error = `Rate limit too low: ${remaining} requests remaining, need ${needed}. Resets in ${resetTime} seconds (${resetDate.toLocaleString()})`;
            errorResponse.rateLimitInfo = {
              used: 150 - parseInt(remaining),
              total: 150,
              remaining: parseInt(remaining),
              needed: parseInt(needed),
              resetTime: parseInt(resetTime),
              resetDate: resetDate.toISOString()
            };
          } else if (simpleLimitMatch) {
            const [, remaining, resetTime, resetDateStr] = simpleLimitMatch;
            const resetDate = new Date(resetDateStr);
            errorResponse.error = `Rate limit too low: ${remaining} requests remaining (need at least 10). Resets in ${resetTime} seconds (${resetDate.toLocaleString()})`;
            errorResponse.rateLimitInfo = {
              used: 150 - parseInt(remaining),
              total: 150,
              remaining: parseInt(remaining),
              resetTime: parseInt(resetTime),
              resetDate: resetDate.toISOString()
            };
          } else {
            errorResponse.error = 'Rate limit exceeded, please try again later';
          }
        }
      } else if (statusCode === 401) {
        errorResponse.error = 'Authentication required or credentials expired';
      }
      
      res.status(statusCode).json(errorResponse);
    }
  });

  router.get('/status', async (req, res) => {
    try {
      const rateLimitStatus = await db.getRateLimitStatus();
      const tokens = await db.getTokens();
      
      // Enhanced rate limit information
      const now = Date.now();
      const resetTimestamp = rateLimitStatus.rate_limit_reset > 0 ? 
        now + (rateLimitStatus.rate_limit_reset * 1000) : null;
      
      const enhancedRateLimit = {
        remaining: rateLimitStatus.rate_limit_remaining,
        used: 150 - rateLimitStatus.rate_limit_remaining,
        total: 150,
        percentageUsed: Math.round(((150 - rateLimitStatus.rate_limit_remaining) / 150) * 100),
        resetIn: rateLimitStatus.rate_limit_reset,
        resetDate: resetTimestamp ? new Date(resetTimestamp).toISOString() : null,
        resetDateFormatted: resetTimestamp ? new Date(resetTimestamp).toLocaleString() : null,
        status: rateLimitStatus.rate_limit_remaining > 50 ? 'healthy' : 
                rateLimitStatus.rate_limit_remaining > 20 ? 'warning' : 'critical',
        isStale: rateLimitStatus.rate_limit_reset === 0 // No reset time means data might be default/stale
      };
      
      console.log(`📊 Status endpoint called - Rate limit: ${enhancedRateLimit.remaining}/150 (${enhancedRateLimit.percentageUsed}% used, ${enhancedRateLimit.status})${enhancedRateLimit.isStale ? ' [STALE DATA]' : ''}`);
      
      res.json({
        rateLimit: enhancedRateLimit,
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

  // Delete selected samples
  router.delete('/samples', async (req, res) => {
    try {
      const { samples } = req.body;
      
      if (!samples || !Array.isArray(samples) || samples.length === 0) {
        return res.status(400).json({ error: 'No samples provided for deletion' });
      }

      console.log('Received samples for deletion:', JSON.stringify(samples, null, 2));

      // Check if we have IDs for all samples - prefer ID-based deletion
      const sampleIds = samples.map(s => s.id).filter(id => id !== undefined && id !== null);
      
      let deletedCount;
      
      if (sampleIds.length === samples.length) {
        // All samples have IDs, use ID-based deletion (more reliable)
        console.log(`Deleting ${sampleIds.length} samples by ID: [${sampleIds.join(', ')}]`);
        deletedCount = await db.deleteSamplesByIds(sampleIds);
      } else {
        // Fallback to field-based deletion
        console.log(`Deleting ${samples.length} samples by field matching`);
        
        // Validate sample data for field-based deletion
        for (const sample of samples) {
          if (!sample.type || (sample.value === undefined || sample.value === null)) {
            return res.status(400).json({ error: 'Invalid sample data: type and value are required' });
          }
        }
        
        deletedCount = await db.deleteSamples(samples);
      }
      
      console.log(`Successfully deleted ${deletedCount} samples`);
      
      res.json({
        message: `Successfully deleted ${deletedCount} samples`,
        deletedCount,
        method: sampleIds.length === samples.length ? 'by-id' : 'by-fields',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Delete samples error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete samples by IDs
  router.delete('/samples/ids', async (req, res) => {
    try {
      const { ids } = req.body;
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'No sample IDs provided for deletion' });
      }

      // Validate IDs are numbers
      const validIds = ids.filter(id => Number.isInteger(id) && id > 0);
      if (validIds.length === 0) {
        return res.status(400).json({ error: 'No valid sample IDs provided' });
      }

      console.log(`Deleting samples with IDs: ${validIds.join(', ')}`);
      const deletedCount = await db.deleteSamplesByIds(validIds);
      
      res.json({
        message: `Successfully deleted ${deletedCount} samples`,
        deletedCount,
        requestedIds: validIds,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Delete samples by IDs error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete all samples of a specific type
  router.delete('/samples/type/:type', async (req, res) => {
    try {
      const { type } = req.params;
      
      if (!type || typeof type !== 'string') {
        return res.status(400).json({ error: 'Invalid sample type provided' });
      }

      console.log(`Deleting all samples of type: ${type}`);
      const deletedCount = await db.deleteSamplesByType(type);
      
      res.json({
        message: `Successfully deleted ${deletedCount} samples of type '${type}'`,
        deletedCount,
        type,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Delete samples by type error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete all samples (with confirmation)
  router.delete('/samples/all', async (req, res) => {
    try {
      const { confirm } = req.body;
      
      if (confirm !== 'DELETE_ALL_SAMPLES') {
        return res.status(400).json({ 
          error: 'Confirmation required. Send { "confirm": "DELETE_ALL_SAMPLES" } to proceed.' 
        });
      }

      console.log('Deleting all samples');
      const deletedCount = await db.deleteAllSamples();
      
      res.json({
        message: `Successfully deleted all ${deletedCount} samples`,
        deletedCount,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Delete all samples error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
