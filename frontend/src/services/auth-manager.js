/**
 * Handles authentication and JWT token UI logic.
 * @module frontend/services/auth-manager
 */
import { Utils } from '../utils.js';

/**
 * Authentication manager for handling authentication and JWT tokens.
 */
export class AuthManager {
    constructor(apiClient, notificationManager) {
        this.apiClient = apiClient;
        this.notificationManager = notificationManager;
        this.setupEventListeners();
    }

    setupEventListeners() {
        const generateJwtBtn = Utils.getElement('generate-jwt-btn');
        if (generateJwtBtn) {
            generateJwtBtn.addEventListener('click', () => this.generateJWT());
        }

        const refreshFitbitBtn = Utils.getElement('refresh-fitbit-btn');
        if (refreshFitbitBtn) {
            refreshFitbitBtn.addEventListener('click', () => this.refreshFitbitTokens());
        }

        const copyJwtBtn = Utils.getElement('copy-jwt-btn');
        if (copyJwtBtn) {
            copyJwtBtn.addEventListener('click', () => this.copyJWT());
        }
    }

    async checkAuthStatus() {
        try {
            const data = await this.apiClient.checkAuthStatus();
            const userNameSpan = Utils.getElement('user-name');
            if (userNameSpan) {
                userNameSpan.textContent = data.user?.name || data.user?.email || 'User';
            }
        } catch (error) {
            if (error.message.includes('401') || error.message.includes('Not authenticated')) {
                window.location.href = '/auth/login';
                return;
            }
            this.notificationManager.showError('Failed to check authentication status: ' + error.message, error.rateLimitInfo);
        }
    }

    async generateJWT() {
        const generateJwtBtn = Utils.getElement('generate-jwt-btn');
        if (!generateJwtBtn) return;

        try {
            generateJwtBtn.disabled = true;
            generateJwtBtn.textContent = 'Generating...';
            
            const data = await this.apiClient.generateJWT();
            
            const jwtToken = Utils.getElement('jwt-token');
            const jwtDisplay = Utils.getElement('jwt-display');
            
            if (jwtToken && jwtDisplay) {
                jwtToken.value = data.accessToken;
                jwtDisplay.classList.remove('hidden');
            }
            
            this.notificationManager.showSuccess('JWT token generated successfully!');
        } catch (error) {
            this.notificationManager.showError('Failed to generate JWT: ' + error.message, error.rateLimitInfo);
        } finally {
            generateJwtBtn.disabled = false;
            generateJwtBtn.textContent = 'Generate New JWT';
        }
    }

    copyJWT() {
        const jwtToken = Utils.getElement('jwt-token');
        const copyJwtBtn = Utils.getElement('copy-jwt-btn');
        
        if (!jwtToken || !copyJwtBtn) return;

        jwtToken.select();
        document.execCommand('copy');
        
        const originalText = copyJwtBtn.textContent;
        copyJwtBtn.textContent = 'Copied!';
        
        setTimeout(() => {
            copyJwtBtn.textContent = originalText;
        }, 2000);
    }

    async refreshFitbitTokens() {
        const refreshFitbitBtn = Utils.getElement('refresh-fitbit-btn');
        if (!refreshFitbitBtn) return;

        try {
            refreshFitbitBtn.disabled = true;
            refreshFitbitBtn.textContent = 'Redirecting...';
            window.location.href = '/auth/refreshtokens';
        } catch (error) {
            this.notificationManager.showError('Failed to refresh Fitbit tokens: ' + error.message, error.rateLimitInfo);
            refreshFitbitBtn.disabled = false;
            refreshFitbitBtn.textContent = 'Refresh Fitbit Tokens';
        }
    }
}
