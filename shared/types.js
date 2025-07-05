/**
 * JSDoc type definitions for shared data structures.
 * @module shared/types
 */

/**
 * @typedef {Object} FitbitTokens
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {number} expires_in
 * @property {string} token_type
 * @property {string} scope
 * @property {string} user_id
 */

/**
 * @typedef {Object} JWTPayload
 * @property {string} sub
 * @property {number} iat
 * @property {number} exp
 * @property {string} type
 */

/**
 * @typedef {Object} SampleData
 * @property {string} type
 * @property {string} date
 * @property {any} value
 * @property {string} [unit]
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} SyncStatus
 * @property {boolean} isRunning
 * @property {string} lastSync
 * @property {string} nextSync
 * @property {number} successCount
 * @property {number} errorCount
 */

/**
 * @typedef {Object} RateLimitInfo
 * @property {number} limit
 * @property {number} remaining
 * @property {string} resetDate
 * @property {string} status
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success
 * @property {any} [data]
 * @property {string} [message]
 * @property {string} [error]
 */

/**
 * @typedef {Object} AuthState
 * @property {boolean} isAuthenticated
 * @property {string} [userName]
 * @property {string} [accessToken]
 * @property {string} [refreshToken]
 */

export {};
