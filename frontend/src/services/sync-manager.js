/**
 * Handles sync operations and related UI.
 * @module frontend/services/sync-manager
 */
import { Utils } from '../utils.js';

/**
 * Sync manager for handling sync operations.
 */
export class SyncManager {
    constructor(apiClient, notificationManager) {
        this.apiClient = apiClient;
        this.notificationManager = notificationManager;
        this.setupEventListeners();
    }

    setupEventListeners() {
        const dateSyncBtn = Utils.getElement('date-sync-btn');
        if (dateSyncBtn) {
            dateSyncBtn.addEventListener('click', () => this.openDateSyncModal());
        }

        const startSyncBtn = Utils.getElement('start-sync');
        if (startSyncBtn) {
            startSyncBtn.addEventListener('click', () => this.performDateSync());
        }

        document.querySelectorAll('input[name="sync-type"]').forEach(radio => {
            radio.addEventListener('change', () => this.toggleSyncType());
        });

        const refreshStatusBtn = Utils.getElement('refresh-status-btn');
        if (refreshStatusBtn) {
            refreshStatusBtn.addEventListener('click', () => this.loadRateLimitStatus());
        }
    }

    openDateSyncModal() {
        const dateSyncModal = Utils.getElement('date-sync-modal');
        if (dateSyncModal) {
            dateSyncModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }

    closeDateSyncModal() {
        const dateSyncModal = Utils.getElement('date-sync-modal');
        if (dateSyncModal) {
            dateSyncModal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    toggleSyncType() {
        const syncTypeRadio = document.querySelector('input[name="sync-type"]:checked');
        if (!syncTypeRadio) return;

        const syncType = syncTypeRadio.value;
        Utils.toggleElement('single-date-section', syncType === 'single');
        Utils.toggleElement('date-range-section', syncType !== 'single');
    }

    async performDateSync() {
        const syncTypeRadio = document.querySelector('input[name="sync-type"]:checked');
        if (!syncTypeRadio) return;

        const syncType = syncTypeRadio.value;
        const sampleTypeSelect = Utils.getElement('sample-type-select');
        const selectedSampleType = sampleTypeSelect ? sampleTypeSelect.value : 'all';
        
        const startSyncBtn = Utils.getElement('start-sync');
        if (!startSyncBtn) return;

        try {
            startSyncBtn.disabled = true;
            startSyncBtn.textContent = 'Syncing...';

            let requestBody = {};
            let successMessage = '';

            if (selectedSampleType && selectedSampleType !== 'all') {
                requestBody.sampleTypes = [selectedSampleType];
            }

            if (syncType === 'single') {
                const dateInput = Utils.getElement('single-date');
                const date = dateInput ? dateInput.value : null;
                
                if (!date) {
                    this.notificationManager.showError('Please select a date');
                    return;
                }

                requestBody.date = date;
                const sampleTypeText = selectedSampleType === 'all' ? 'all sample types' : selectedSampleType;
                successMessage = `Date sync completed for ${date} (${sampleTypeText})!`;
            } else {
                const startDateInput = Utils.getElement('start-date');
                const endDateInput = Utils.getElement('end-date');
                const startDate = startDateInput ? startDateInput.value : null;
                const endDate = endDateInput ? endDateInput.value : null;

                const validation = Utils.validateDateRange(startDate, endDate, 30);
                if (!validation.valid) {
                    this.notificationManager.showError(validation.error);
                    return;
                }

                requestBody.startDate = startDate;
                requestBody.endDate = endDate;
                const sampleTypeText = selectedSampleType === 'all' ? 'all sample types' : selectedSampleType;
                successMessage = `Date range sync completed for ${startDate} to ${endDate} (${sampleTypeText})! (${validation.daysDiff} days)`;
            }

            const data = await this.apiClient.triggerSync(requestBody);
            this.closeDateSyncModal();

            if (data.results && data.results.totalSamples !== undefined) {
                successMessage += ` ${data.results.totalSamples} total samples processed.`;
            } else if (data.results) {
                const syncCount = Object.keys(data.results).length;
                successMessage += ` ${syncCount} data types synced.`;
            }

            this.notificationManager.showSuccess(successMessage);
            
            await this.loadRateLimitStatus();
            
            if (window.app && window.app.sampleManager) {
                await window.app.sampleManager.loadSamples();
            }
        } catch (error) {
            this.notificationManager.showError('Failed to perform date sync: ' + error.message, error.rateLimitInfo);
        } finally {
            startSyncBtn.disabled = false;
            startSyncBtn.textContent = 'Start Sync';
        }
    }

    async loadRateLimitStatus() {
        const rateLimitHealth = Utils.getElement('rate-limit-health');
        
        try {
            const data = await this.apiClient.getStatus();
            const rateLimit = data.rateLimit;

            Utils.setElementText('rate-limit-usage', `${rateLimit.used}/${rateLimit.total} (${rateLimit.percentageUsed}%)`);
            Utils.setElementText('rate-limit-remaining', `${rateLimit.remaining} requests`);
            
            if (rateLimitHealth) {
                rateLimitHealth.textContent = rateLimit.status;
                rateLimitHealth.className = `status-badge status-${rateLimit.status}`;
            }

            let resetText = rateLimit.resetDateFormatted || 'Unknown';
            if (rateLimit.isStale) {
                resetText += ' (estimated)';
            }
            Utils.setElementText('rate-limit-reset', resetText);

            console.log(`Rate limit status updated: ${rateLimit.remaining}/150 remaining (${rateLimit.status})`);
        } catch (error) {
            console.error('Failed to load rate limit status:', error);
            
            Utils.setElementText('rate-limit-usage', 'Error loading');
            Utils.setElementText('rate-limit-remaining', 'Error loading');
            Utils.setElementText('rate-limit-reset', 'Error loading');
            
            if (rateLimitHealth) {
                rateLimitHealth.textContent = 'Error';
                rateLimitHealth.className = 'status-badge status-error';
            }
        }
    }
}
