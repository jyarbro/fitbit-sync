/**
 * API client for HTTP requests to backend
 */
export class ApiClient {
    /**
     * Create a new ApiClient instance.
     */
    constructor() {
        this.baseURL = '';
    }

    /**
     * Make an API call with error handling and rate limit info.
     * @param {string} url - API endpoint URL
     * @param {Object} [options] - Fetch options
     * @returns {Promise<Object>} - API response data
     * @throws {Error} - If the response is not ok
     */
    async call(url, options = {}) {
        try {
            const response = await fetch(url, {
                credentials: 'include',
                ...options
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Full error response:', errorData);
                
                if (errorData.errors && Array.isArray(errorData.errors)) {
                    console.error('Error details:', errorData.errors);
                    errorData.errors.forEach((err, index) => {
                        console.error(`Error ${index + 1}:`, err);
                    });
                }

                if (errorData.rateLimitInfo) {
                    console.error('🚫 Rate Limit Details:', errorData.rateLimitInfo);
                    console.error(`   Usage: ${errorData.rateLimitInfo.used}/${errorData.rateLimitInfo.total} requests`);
                    console.error(`   Remaining: ${errorData.rateLimitInfo.remaining} requests`);
                    console.error(`   Reset time: ${errorData.rateLimitInfo.resetTime} seconds`);
                    console.error(`   Reset date: ${new Date(errorData.rateLimitInfo.resetDate).toLocaleString()}`);
                }

                const error = new Error(errorData.error || `HTTP ${response.status}`);
                error.rateLimitInfo = errorData.rateLimitInfo;
                throw error;
            }

            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    /**
     * Make a GET request.
     * @param {string} url - API endpoint URL
     * @returns {Promise<Object>} - API response data
     */
    async get(url) {
        return this.call(url);
    }

    /**
     * Make a POST request.
     * @param {string} url - API endpoint URL
     * @param {Object} data - Request body data
     * @returns {Promise<Object>} - API response data
     */
    async post(url, data) {
        return this.call(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
    }

    /**
     * Make a DELETE request.
     * @param {string} url - API endpoint URL
     * @param {Object} [data] - Request body data
     * @returns {Promise<Object>} - API response data
     */
    async delete(url, data = null) {
        const options = {
            method: 'DELETE'
        };

        if (data) {
            options.headers = {
                'Content-Type': 'application/json'
            };
            options.body = JSON.stringify(data);
        }

        return this.call(url, options);
    }

    /**
     * Check authentication status.
     * @returns {Promise<Object>} - Auth status response
     */
    async checkAuthStatus() {
        return this.get('/auth/auth-status');
    }

    /**
     * Request a new JWT from the server.
     * @returns {Promise<Object>} - JWT response
     */
    async generateJWT() {
        return this.get('/auth/newtoken');
    }

    /**
     * Get available sample types.
     * @returns {Promise<Object>} - Sample types response
     */
    async getSampleTypes() {
        return this.get('/api/sample-types');
    }

    /**
     * Get samples with optional query params.
     * @param {Object} [params] - Query parameters
     * @returns {Promise<Object>} - Samples response
     */
    async getSamples(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return this.get(`/api/samples?${queryString}`);
    }

    /**
     * Delete samples by IDs.
     * @param {Array} samples - Array of sample IDs
     * @returns {Promise<Object>} - Delete response
     */
    async deleteSamples(samples) {
        return this.delete('/api/samples', { samples });
    }

    /**
     * Get sample count for a date and types.
     * @param {string} date - Date string
     * @param {Array} [types] - Array of sample types
     * @returns {Promise<Object>} - Count response
     */
    async getSampleCountByDate(date, types = []) {
        const params = new URLSearchParams();
        if (types.length > 0) {
            params.append('types', types.join(','));
        }
        return this.get(`/api/samples/date/${date}/count?${params}`);
    }

    /**
     * Delete samples by date and types.
     * @param {string} date - Date string
     * @param {Array} [types] - Array of sample types
     * @returns {Promise<Object>} - Delete response
     */
    async deleteSamplesByDate(date, types = []) {
        const requestBody = {};
        if (types.length > 0) {
            requestBody.types = types;
        }
        return this.delete(`/api/samples/date/${date}`, requestBody);
    }

    /**
     * Trigger a manual sync.
     * @param {Object} syncData - Sync request body
     * @returns {Promise<Object>} - Sync response
     */
    async triggerSync(syncData) {
        return this.post('/api/sync/trigger', syncData);
    }

    /**
     * Get API status.
     * @returns {Promise<Object>} - Status response
     */
    async getStatus() {
        return this.get('/api/status');
    }
}
