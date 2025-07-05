/**
 * Shared utility functions for backend and frontend.
 * @module shared/utils
 */

/**
 * Format a Date object as YYYY-MM-DD string.
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Parse a YYYY-MM-DD string to a Date object (UTC midnight).
 * @param {string} dateString
 * @returns {Date}
 */
export function parseDate(dateString) {
    return new Date(dateString + 'T00:00:00Z');
}

/**
 * Get an array of YYYY-MM-DD strings between two dates (inclusive).
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {string[]}
 */
export function getDateRange(startDate, endDate) {
    const dates = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        dates.push(formatDate(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
}

/**
 * Check if a string is a valid JWT token format.
 * @param {string} token
 * @returns {boolean}
 */
export function isValidJWT(token) {
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    return parts.length === 3;
}

/**
 * Sanitize an error for client response.
 * @param {Error} error
 * @param {boolean} [isDevelopment=false]
 * @returns {string}
 */
export function sanitizeError(error, isDevelopment = false) {
    if (isDevelopment) {
        return error.message || 'Unknown error occurred';
    }
    return 'An error occurred while processing your request';
}

/**
 * Deep clone an object using JSON serialization.
 * @param {any} obj
 * @returns {any}
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce a function, limiting how often it can be called.
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
