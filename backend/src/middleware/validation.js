/**
 * Validation middleware for API requests.
 * @module backend/middleware/validation
 */

/**
 * Validation middleware service.
 */
class ValidationMiddleware {
  /**
   * Input validation middleware for sync requests.
   * @returns {function} Express middleware function
   */
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
}

export default ValidationMiddleware;
