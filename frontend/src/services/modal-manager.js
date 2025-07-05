/**
 * Handles modal dialogs and related UI logic.
 * @module frontend/services/modal-manager
 */
import { Utils } from '../utils.js';

/**
 * Modal manager for handling modal dialogs.
 */
export class ModalManager {
    constructor(apiClient, notificationManager, sampleManager) {
        this.apiClient = apiClient;
        this.notificationManager = notificationManager;
        this.sampleManager = sampleManager;
        this.setupEventListeners();
    }

    setupEventListeners() {
        const closeDateModalBtn = Utils.getElement('close-modal');
        if (closeDateModalBtn) {
            closeDateModalBtn.addEventListener('click', () => this.closeDateSyncModal());
        }

        const cancelSyncBtn = Utils.getElement('cancel-sync');
        if (cancelSyncBtn) {
            cancelSyncBtn.addEventListener('click', () => this.closeDateSyncModal());
        }

        const deleteSamplesBtn = Utils.getElement('delete-samples-btn');
        if (deleteSamplesBtn) {
            deleteSamplesBtn.addEventListener('click', () => this.openDeleteSamplesModal());
        }

        const closeDeleteModalBtn = Utils.getElement('close-delete-modal');
        if (closeDeleteModalBtn) {
            closeDeleteModalBtn.addEventListener('click', () => this.closeDeleteSamplesModal());
        }

        const cancelDeleteBtn = Utils.getElement('cancel-delete');
        if (cancelDeleteBtn) {
            cancelDeleteBtn.addEventListener('click', () => this.closeDeleteSamplesModal());
        }

        const previewDeletionBtn = Utils.getElement('preview-deletion-btn');
        if (previewDeletionBtn) {
            previewDeletionBtn.addEventListener('click', () => this.previewDeletion());
        }

        const deleteByDateBtn = Utils.getElement('delete-by-date-btn');
        if (deleteByDateBtn) {
            deleteByDateBtn.addEventListener('click', () => this.deleteSamplesByDate());
        }

        this.setupModalClickOutside();
    }

    setupModalClickOutside() {
        const dateSyncModal = Utils.getElement('date-sync-modal');
        if (dateSyncModal) {
            dateSyncModal.addEventListener('click', (e) => {
                if (e.target === dateSyncModal) {
                    this.closeDateSyncModal();
                }
            });
        }

        const deleteSamplesModal = Utils.getElement('delete-samples-modal');
        if (deleteSamplesModal) {
            deleteSamplesModal.addEventListener('click', (e) => {
                if (e.target === deleteSamplesModal) {
                    this.closeDeleteSamplesModal();
                }
            });
        }
    }

    closeDateSyncModal() {
        const dateSyncModal = Utils.getElement('date-sync-modal');
        if (dateSyncModal) {
            dateSyncModal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    openDeleteSamplesModal() {
        const deleteSamplesModal = Utils.getElement('delete-samples-modal');
        if (deleteSamplesModal) {
            deleteSamplesModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        const deleteDateInput = Utils.getElement('delete-date');
        if (deleteDateInput && !deleteDateInput.value) {
            const today = new Date();
            deleteDateInput.value = Utils.formatDateForInput(today);
            deleteDateInput.max = Utils.formatDateForInput(today);
        }

        Utils.toggleElement('deletion-preview', false);
    }

    closeDeleteSamplesModal() {
        const deleteSamplesModal = Utils.getElement('delete-samples-modal');
        if (deleteSamplesModal) {
            deleteSamplesModal.classList.add('hidden');
            document.body.style.overflow = '';
        }

        const deleteDateInput = Utils.getElement('delete-date');
        if (deleteDateInput) {
            deleteDateInput.value = '';
        }

        const deleteTypesSelect = Utils.getElement('delete-types');
        if (deleteTypesSelect) {
            deleteTypesSelect.selectedIndex = -1;
        }

        Utils.toggleElement('deletion-preview', false);
    }

    async previewDeletion() {
        const deleteDateInput = Utils.getElement('delete-date');
        const deleteTypesSelect = Utils.getElement('delete-types');
        const deletionPreview = Utils.getElement('deletion-preview');
        const previewContent = Utils.getElement('preview-content');

        if (!deleteDateInput || !deleteTypesSelect || !deletionPreview || !previewContent) {
            return;
        }

        try {
            const date = deleteDateInput.value;
            if (!date) {
                this.notificationManager.showError('Please select a date for deletion preview.');
                return;
            }

            const selectedTypes = Array.from(deleteTypesSelect.selectedOptions)
                .map(option => option.value)
                .filter(value => value);

            const previewData = await this.sampleManager.previewDeletion(date, selectedTypes);
            
            deletionPreview.classList.remove('hidden');

            if (previewData.totalCount === 0) {
                previewContent.innerHTML = `
                    <div class="preview-summary">
                        <div class="preview-total">No samples found for ${date}</div>
                        <p>No samples will be deleted.</p>
                    </div>
                `;
                return;
            }

            const typesText = previewData.types.length > 0 ? previewData.types.join(', ') : 'all types';
            let byTypeHtml = '';
            
            if (previewData.byType.length > 0) {
                byTypeHtml = `
                    <div class="preview-by-type">
                        ${previewData.byType.map(typeInfo => `
                            <div class="type-count">
                                <span class="type-name">${typeInfo.type}:</span>
                                <span class="type-total">${typeInfo.count}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            previewContent.innerHTML = `
                <div class="preview-summary">
                    <div class="preview-total">Warning: ${previewData.totalCount} samples will be deleted for ${date}</div>
                    <p><strong>Types to delete:</strong> ${typesText}</p>
                    ${byTypeHtml}
                </div>
                <p><strong>Warning:</strong> This action cannot be undone. All selected samples for this date will be permanently deleted.</p>
            `;
        } catch (error) {
            console.error('Failed to preview deletion:', error);
            this.notificationManager.showError(`Failed to preview deletion: ${error.message}`);
        }
    }

    async deleteSamplesByDate() {
        const deleteDateInput = Utils.getElement('delete-date');
        const deleteTypesSelect = Utils.getElement('delete-types');

        if (!deleteDateInput || !deleteTypesSelect) return;

        try {
            const date = deleteDateInput.value;
            if (!date) {
                this.notificationManager.showError('Please select a date for deletion.');
                return;
            }

            const selectedTypes = Array.from(deleteTypesSelect.selectedOptions)
                .map(option => option.value)
                .filter(value => value);

            this.sampleManager.showLoading(true);
            this.notificationManager.hideError();

            const response = await this.sampleManager.deleteSamplesByDate(date, selectedTypes);
            
            this.notificationManager.showSuccess(response.message);
            this.closeDeleteSamplesModal();
        } catch (error) {
            console.error('Failed to delete samples by date:', error);
            this.notificationManager.showError(`Failed to delete samples: ${error.message}`);
        } finally {
            this.sampleManager.showLoading(false);
        }
    }
}
