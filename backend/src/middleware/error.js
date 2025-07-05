/**
 * Error handling middleware for the application.
 * @module backend/middleware/error
 */
import crypto from 'crypto';

/**
 * Error handling middleware service.
 */
class ErrorMiddleware {
  /**
   * Global error handler middleware.
   * @returns {function} Express middleware function
   */
  errorHandler() {
    return (error, req, res, next) => {
      // Log the error for server-side debugging
      console.error('API Error:', error);
      
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
      
      if (error.response) {
        console.error('Response error data:', {
          status: error.response.status,
          headers: error.response.headers,
          data: error.response.data
        });
      }
      
      const isDevelopment = process.env.NODE_ENV === 'development';
      const errorId = crypto.randomBytes(8).toString('hex'); // For tracking errors
      
      // Determine error type and appropriate status code
      let statusCode = 500;
      let publicErrorMessage = 'Internal server error';
      
      // Map common errors to appropriate HTTP status codes and user-friendly messages
      if (error.message.includes('Rate limit')) {
        statusCode = 429;
        
        // Try to extract detailed rate limit info from the error message (multiple patterns)
        let detailedRateLimitMatch = error.message.match(/Used (\d+)\/(\d+) requests\. (\d+) remaining\. Resets in (\d+) seconds/);
        
        if (detailedRateLimitMatch) {
          const [, used, total, remaining, resetTime] = detailedRateLimitMatch;
          const resetDate = new Date(Date.now() + parseInt(resetTime) * 1000);
          publicErrorMessage = `Rate limit exceeded: ${used}/${total} requests used, ${remaining} remaining. Resets in ${resetTime} seconds (${resetDate.toLocaleString()})`;
          
          console.error(`🚫 Enhanced rate limit error logged [${errorId}]:`, {
            used: parseInt(used),
            total: parseInt(total),
            remaining: parseInt(remaining),
            resetTime: parseInt(resetTime),
            resetDate: resetDate.toISOString()
          });
        } else {
          // Try alternative patterns
          const simpleLimitMatch = error.message.match(/Rate limit too low: (\d+) requests remaining.*?resets in (\d+) seconds at (.+)/);
          const rangeLimitMatch = error.message.match(/Rate limit too low: (\d+) requests remaining, need approximately (\d+).*?resets in (\d+) seconds at (.+)/);
          
          if (rangeLimitMatch) {
            const [, remaining, needed, resetTime, resetDateStr] = rangeLimitMatch;
            const resetDate = new Date(resetDateStr);
            publicErrorMessage = `Rate limit too low: ${remaining} requests remaining, need ${needed}. Resets in ${resetTime} seconds (${resetDate.toLocaleString()})`;
            
            console.error(`🚫 Enhanced rate limit error logged [${errorId}]:`, {
              used: 150 - parseInt(remaining),
              total: 150,
              remaining: parseInt(remaining),
              needed: parseInt(needed),
              resetTime: parseInt(resetTime),
              resetDate: resetDate.toISOString()
            });
          } else if (simpleLimitMatch) {
            const [, remaining, resetTime, resetDateStr] = simpleLimitMatch;
            const resetDate = new Date(resetDateStr);
            publicErrorMessage = `Rate limit too low: ${remaining} requests remaining (need at least 10). Resets in ${resetTime} seconds (${resetDate.toLocaleString()})`;
            
            console.error(`🚫 Enhanced rate limit error logged [${errorId}]:`, {
              used: 150 - parseInt(remaining),
              total: 150,
              remaining: parseInt(remaining),
              resetTime: parseInt(resetTime),
              resetDate: resetDate.toISOString()
            });
          } else {
            publicErrorMessage = 'Rate limit exceeded, please try again later';
          }
        }
      } else if (error.message.includes('No tokens') || error.message.includes('Invalid token') || 
                error.message.includes('expired token') || error.message.includes('Authentication required')) {
        statusCode = 401;
        publicErrorMessage = 'Authentication required or credentials expired';
      } else if (error.message.includes('Not found') || error.message.includes('does not exist')) {
        statusCode = 404;
        publicErrorMessage = 'Requested resource not found';
      } else if (error.message.includes('Permission') || error.message.includes('Forbidden')) {
        statusCode = 403;
        publicErrorMessage = 'You do not have permission to access this resource';
      } else if (error.message.includes('Invalid') || error.message.includes('Missing required') || 
                error.message.includes('validation')) {
        statusCode = 400;
        publicErrorMessage = 'Invalid request parameters';
      }
      
      // Use status code from the response if available
      if (error.response?.status) {
        statusCode = error.response.status;
      }
      
      // Create a sanitized error response
      const errorResponse = {
        error: publicErrorMessage,
        errorId: errorId,
        timestamp: new Date().toISOString()
      };
      
      // Only add detailed error information in development
      if (isDevelopment) {
        errorResponse.devMessage = error.message;
        
        if (error.response?.data) {
          // Still sanitize the response data to avoid leaking sensitive info
          const safeResponseData = { ...error.response.data };
          
          // Remove potential sensitive fields
          delete safeResponseData.stack;
          delete safeResponseData.trace;
          delete safeResponseData.password;
          delete safeResponseData.token;
          delete safeResponseData.secret;
          
          errorResponse.responseData = safeResponseData;
        }
      }
      
      res.status(statusCode).json(errorResponse);
    };
  }
}

export default ErrorMiddleware;
