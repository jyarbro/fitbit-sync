/**
 * Shared constants for API endpoints, sample types, and config.
 * @module shared/constants
 */

export const API_ENDPOINTS = {
    AUTH: {
        LOGIN: '/auth/login',
        LOGOUT: '/auth/logout',
        CALLBACK: '/auth/callback',
        REFRESH: '/auth/refresh'
    },
    API: {
        HEALTH: '/health',
        SYNC: '/api/sync',
        DATA: '/api/data',
        SAMPLES: '/api/samples',
        RATE_LIMIT: '/api/rate-limit'
    }
};

export const FITBIT_SCOPES = [
    'activity',
    'heartrate', 
    'sleep',
    'oxygen_saturation',
    'respiratory_rate',
    'temperature'
];

export const SAMPLE_TYPES = {
    STEPS: 'steps',
    HEART_RATE: 'heart_rate',
    SLEEP: 'sleep',
    OXYGEN_SATURATION: 'oxygen_saturation',
    RESPIRATORY_RATE: 'respiratory_rate',
    TEMPERATURE: 'temperature'
};

export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500
};

export const JWT_CONFIG = {
    DEFAULT_EXPIRATION: '30d',
    REFRESH_EXPIRATION: '90d',
    ALGORITHM: 'HS256'
};

export const SYNC_CONFIG = {
    DEFAULT_DAY_INTERVAL: 5,
    DEFAULT_NIGHT_INTERVAL: 60,
    DAY_START_HOUR: 8,
    DAY_END_HOUR: 20
};
