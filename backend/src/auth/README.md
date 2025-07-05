# Authentication Module

## Overview
The authentication system is organized into a dedicated Auth module that separates concerns between different authentication providers and functionality areas. This follows the single responsibility principle and makes the codebase more maintainable.

## Structure

### Core Modules

#### 1. `frontend.js`
**Purpose**: Handles JWT token generation and management for frontend authentication
**Responsibilities**:
- Generate personal JWT tokens for iOS shortcuts access
- Refresh JWT tokens
- JWT verification and middleware
- Session management utilities
**Routes**:
- `GET /auth/newtoken` - Generate new JWT tokens
- `POST /auth/refresh-token` - Refresh JWT tokens
- `GET /auth/auth-status` - Check authentication status
- `GET /auth/logout` - Logout user

#### 2. `microsoft.js`
**Purpose**: Handles Microsoft Entra ID (Azure AD) OAuth integration
**Responsibilities**:
- Microsoft OAuth flow initiation
- Token exchange with Microsoft
- User session management for Microsoft auth
- State validation
**Routes**:
- `GET /auth/login` - Initiate Microsoft login
- `GET /auth/entra-login` - Handle Microsoft OAuth callback

#### 3. `fitbit.js`
**Purpose**: Handles Fitbit OAuth authentication
**Responsibilities**:
- Fitbit OAuth flow with PKCE
- Token exchange with Fitbit
- OAuth state management
- Token refresh for Fitbit
**Routes**:
- `GET /auth/refreshtokens` - Initiate Fitbit OAuth
- `GET /auth/callback` - Handle Fitbit OAuth callback

#### 4. `index.js`
**Purpose**: Main Auth orchestrator
**Functionality**: 
- Combines all authentication modules
- Creates unified router
- Provides access to individual auth services

## Architecture Benefits

1. **Separation of Concerns**: Each module handles one specific authentication provider
2. **Maintainability**: Changes to one authentication provider don't affect others
3. **Testability**: Each module can be tested independently
4. **Scalability**: Easy to add new authentication providers
5. **Code Reusability**: Common functionality is abstracted appropriately

## Usage

```javascript
import Auth from './Auth/index.js';

// Initialize the auth system
const auth = new Auth();

// Use in Express app
app.use('/auth', auth.createRoutes({ fitbitService, db }));

// Access individual services
const frontendAuth = auth.getFrontendService();
const jwtMiddleware = frontendAuth.verifyJWTMiddleware();
```

## Environment Variables

### Frontend Auth
- `JWT_SECRET` - Secret for signing JWT tokens
- `JWT_EXPIRATION` - Access token expiration (default: 30d)
- `JWT_REFRESH_EXPIRATION` - Refresh token expiration (default: 90d)

### Microsoft Auth
- `ENTRA_CLIENT_ID` - Microsoft app client ID
- `ENTRA_CLIENT_SECRET` - Microsoft app client secret
- `ENTRA_TENANT_ID` - Microsoft tenant ID
- `ENTRA_REDIRECT_URI` - OAuth redirect URI

### Fitbit Auth
- `CLIENT_ID` - Fitbit app client ID
- `CLIENT_SECRET` - Fitbit app client secret
- `REDIRECT_URI` - Fitbit OAuth redirect URI

## Security Features

- **PKCE**: Implemented for Fitbit OAuth flow
- **State Validation**: CSRF protection for all OAuth flows
- **Session Management**: Secure session handling with expiration
- **JWT Security**: Proper token signing and verification
- **Error Handling**: Sanitized error responses

## Migration Notes

The existing API remains unchanged - all endpoints work the same way. The refactoring only affects internal organization:

- Frontend applications continue to use the same `/auth/*` endpoints
- JWT token generation and validation work identically
- OAuth flows remain unchanged from the user perspective
- Session management continues to work as before

## Future Enhancements

This architecture makes it easy to:
- Add new OAuth providers (Google, GitHub, etc.)
- Implement different JWT strategies
- Add provider-specific features
- Enhance security on a per-provider basis
- Add comprehensive logging and monitoring per provider
