/**
 * Main application class for frontend orchestration.
 * @module frontend/app
 */
import { ApiClient } from './services/api-client.js';
import { NotificationManager } from './services/notification-manager.js';
import { AuthManager } from './services/auth-manager.js';
import { SampleManager } from './services/sample-manager.js';
import { SyncManager } from './services/sync-manager.js';
import { ModalManager } from './services/modal-manager.js';
import { Utils } from './utils.js';

/**
 * Main App orchestrates all managers and initializes the UI.
 */
export class App {
    constructor() {
        this.apiClient = new ApiClient();
        this.notificationManager = new NotificationManager();
        this.authManager = new AuthManager(this.apiClient, this.notificationManager);
        this.sampleManager = new SampleManager(this.apiClient, this.notificationManager);
        this.syncManager = new SyncManager(this.apiClient, this.notificationManager);
        this.modalManager = new ModalManager(this.apiClient, this.notificationManager, this.sampleManager);
        
        // Make app globally available for cross-manager communication
        window.app = this;
    }

    /**
     * Initialize the application
     * Main entry point - loads authentication, rate limit, sample types, and sample data
     * Sets up all event listeners for UI controls
     */
    async initialize() {
        try {
            // Initialize date inputs
            Utils.initializeDateInputs();
            
            // Load initial data
            await this.authManager.checkAuthStatus();
            await this.syncManager.loadRateLimitStatus();
            await this.sampleManager.loadSampleTypes();
            await this.sampleManager.loadSamples();
            
            console.log('Fitbit Sync App initialized successfully');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.notificationManager.showError('Failed to initialize application: ' + error.message);
        }
    }

    /**
     * Get the sample manager instance
     * @returns {SampleManager} Sample manager instance
     */
    getSampleManager() {
        return this.sampleManager;
    }

    /**
     * Get the sync manager instance
     * @returns {SyncManager} Sync manager instance
     */
    getSyncManager() {
        return this.syncManager;
    }

    /**
     * Get the auth manager instance
     * @returns {AuthManager} Auth manager instance
     */
    getAuthManager() {
        return this.authManager;
    }

    /**
     * Get the notification manager instance
     * @returns {NotificationManager} Notification manager instance
     */
    getNotificationManager() {
        return this.notificationManager;
    }

    /**
     * Get the modal manager instance
     * @returns {ModalManager} Modal manager instance
     */
    getModalManager() {
        return this.modalManager;
    }

    /**
     * Get the API client instance
     * @returns {ApiClient} API client instance
     */
    getApiClient() {
        return this.apiClient;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const app = new App();
    await app.initialize();
});
