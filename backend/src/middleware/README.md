# Middleware Module

## Overview
This module contains reusable middleware functions that handle cross-cutting concerns like security, validation, and error handling. These middleware functions are used throughout the application to provide consistent behavior.

## Middleware Components

### 1. `security.js`
**Purpose**: Provides security-related middleware functions
**Middleware Functions**:
- `blockSensitiveFiles()` - Blocks access to sensitive file types (.db, .sqlite, .env, .log)
- `createRateLimiter(windowMs, max)` - Creates rate limiting middleware with configurable window and request limits
- `corsMiddleware()` - Handles Cross-Origin Resource Sharing (CORS) headers

**Usage**:
```javascript
import SecurityMiddleware from './middleware/security.js';

const securityMiddleware = new SecurityMiddleware();
app.use(securityMiddleware.blockSensitiveFiles());
app.use(securityMiddleware.corsMiddleware());
app.use(securityMiddleware.createRateLimiter(15 * 60 * 1000, 100)); // 15 min window, 100 requests
```

### 2. `validation.js`
**Purpose**: Provides request validation middleware
**Middleware Functions**:
- `validateSyncRequest()` - Validates sync request parameters, specifically `lastSyncTimestamp` format and constraints

**Usage**:
```javascript
import ValidationMiddleware from './middleware/validation.js';

const validationMiddleware = new ValidationMiddleware();
router.post('/sync', validationMiddleware.validateSyncRequest(), handler);
```

### 3. `error.js`
**Purpose**: Provides comprehensive error handling middleware
**Middleware Functions**:
- `errorHandler()` - Global error handler that sanitizes errors, provides appropriate HTTP status codes, and logs detailed error information

**Features**:
- Maps common error types to appropriate HTTP status codes
- Provides detailed rate limit information when applicable
- Sanitizes error responses to prevent information leakage
- Includes detailed error information in development mode
- Generates unique error IDs for tracking

**Usage**:
```javascript
import ErrorMiddleware from './middleware/error.js';

const errorMiddleware = new ErrorMiddleware();
app.use(errorMiddleware.errorHandler()); // Should be last middleware
```

## Environment Variables

### Security Middleware
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins (default: `https://localhost:8080`)

### Error Middleware
- `NODE_ENV` - Environment mode (`development` shows detailed errors, `production` shows sanitized errors)

## Architecture Benefits

1. **Reusability**: Middleware can be easily reused across different routes and modules
2. **Consistency**: Provides consistent behavior across the application
3. **Separation of Concerns**: Each middleware handles a specific cross-cutting concern
4. **Testability**: Each middleware can be tested independently
5. **Maintainability**: Changes to middleware behavior are centralized

## Security Features

- **File Protection**: Prevents access to sensitive files
- **Rate Limiting**: Protects against abuse and DoS attacks
- **CORS Control**: Manages cross-origin requests securely
- **Error Sanitization**: Prevents information disclosure through error messages
- **Request Validation**: Ensures data integrity and prevents invalid requests

## Usage Pattern

```javascript
// In app.js
import SecurityMiddleware from './middleware/security.js';
import ValidationMiddleware from './middleware/validation.js';
import ErrorMiddleware from './middleware/error.js';

const securityMiddleware = new SecurityMiddleware();
const validationMiddleware = new ValidationMiddleware();
const errorMiddleware = new ErrorMiddleware();

// Apply security middleware globally
app.use(securityMiddleware.blockSensitiveFiles());
app.use(securityMiddleware.corsMiddleware());
app.use(securityMiddleware.createRateLimiter());

// Use validation middleware on specific routes
router.post('/api/sync', validationMiddleware.validateSyncRequest(), handler);

// Apply error handling middleware last
app.use(errorMiddleware.errorHandler());
```
