/**
 * Handles sample data operations and UI state.
 * @module frontend/services/sample-manager
 */
import { Utils } from '../utils.js';

/**
 * Sample manager for handling sample data operations.
 */
export class SampleManager {
    constructor(apiClient, notificationManager) {
        this.apiClient = apiClient;
        this.notificationManager = notificationManager;
        
        // State
        this.currentPage = 1;
        this.currentFilter = '';
        this.totalPages = 1;
        this.sortColumn = 'timestamp';
        this.sortDirection = 'desc';
        this.selectedSamples = new Set();
        this.currentSamples = [];

        this.setupEventListeners();
    }

    setupEventListeners() {
        const typeFilter = Utils.getElement('type-filter');
        if (typeFilter) {
            typeFilter.addEventListener('change', () => this.onFilterChange());
        }

        const refreshSamplesBtn = Utils.getElement('refresh-samples-btn');
        if (refreshSamplesBtn) {
            refreshSamplesBtn.addEventListener('click', () => this.loadSamples());
        }

        const prevPageBtn = Utils.getElement('prev-page');
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => this.changePage(this.currentPage - 1));
        }

        const nextPageBtn = Utils.getElement('next-page');
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => this.changePage(this.currentPage + 1));
        }

        const headerSelectAll = Utils.getElement('header-select-all');
        if (headerSelectAll) {
            headerSelectAll.addEventListener('change', (e) => this.handleSelectAll(e));
        }

        const deleteSelectedBtn = Utils.getElement('delete-selected-btn');
        if (deleteSelectedBtn) {
            deleteSelectedBtn.addEventListener('click', () => this.deleteSelectedSamples());
        }

        const samplesTable = Utils.getElement('samples-table');
        if (samplesTable) {
            samplesTable.querySelectorAll('th[data-sort]').forEach(th => {
                th.addEventListener('click', () => this.sortTable(th.dataset.sort));
            });
        }

        window.addEventListener('popstate', () => {
            this.loadSamples();
        });
    }

    async loadSampleTypes() {
        try {
            const data = await this.apiClient.getSampleTypes();
            const typeFilter = Utils.getElement('type-filter');
            
            if (typeFilter) {
                typeFilter.innerHTML = '<option value="">All Types</option>';
                data.types.forEach(type => {
                    const option = document.createElement('option');
                    option.value = type;
                    option.textContent = type;
                    typeFilter.appendChild(option);
                });
            }

            const deleteTypesSelect = Utils.getElement('delete-types');
            if (deleteTypesSelect) {
                deleteTypesSelect.innerHTML = '<option value="">All Types (select none to delete all)</option>';
                data.types.forEach(type => {
                    const option = document.createElement('option');
                    option.value = type;
                    option.textContent = type;
                    deleteTypesSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to load sample types:', error);
        }
    }

    async loadSamples() {
        try {
            this.showLoading(true);
            this.notificationManager.hideError();

            const params = {
                page: this.currentPage,
                limit: 100,
                sort: this.sortColumn,
                direction: this.sortDirection
            };

            if (this.currentFilter) {
                params.type = this.currentFilter;
            }

            const data = await this.apiClient.getSamples(params);
            this.displaySamples(data.samples);
            this.updatePagination(data.pagination);
        } catch (error) {
            if (error.message.includes('401') || error.message.includes('Not authenticated')) {
                window.location.href = '/auth/login';
                return;
            }
            this.notificationManager.showError('Failed to load samples: ' + error.message, error.rateLimitInfo);
            const samplesTbody = Utils.getElement('samples-tbody');
            if (samplesTbody) {
                samplesTbody.innerHTML = '<tr><td colspan="4">Failed to load samples</td></tr>';
            }
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        Utils.toggleElement('loading', show);
        const samplesTable = Utils.getElement('samples-table');
        if (samplesTable) {
            samplesTable.style.opacity = show ? '0.5' : '1';
        }
    }

    displaySamples(samples) {
        const samplesTbody = Utils.getElement('samples-tbody');
        const selectionControls = Utils.getElement('selection-controls');
        
        if (!samplesTbody) return;

        if (!samples || samples.length === 0) {
            samplesTbody.innerHTML = '<tr><td colspan="4">No samples found</td></tr>';
            Utils.toggleElement('selection-controls', false);
            return;
        }

        this.currentSamples = samples;
        this.selectedSamples.clear();

        samplesTbody.innerHTML = samples.map((sample, index) => {
            const timestamp = sample.timestamp || sample.startTime || 'N/A';
            const formattedTimestamp = timestamp !== 'N/A' ? 
                new Date(timestamp).toLocaleString() : 'N/A';
            const sampleId = sample.id || `fallback-${index}`;
            
            return `
                <tr data-sample-id="${sampleId}">
                    <td>
                        <input type="checkbox" class="sample-checkbox" data-sample-id="${sampleId}">
                    </td>
                    <td>${Utils.escapeHtml(sample.type)}</td>
                    <td>${sample.value}</td>
                    <td>${formattedTimestamp}</td>
                </tr>
            `;
        }).join('');

        Utils.toggleElement('selection-controls', true);

        document.querySelectorAll('.sample-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.handleSampleSelection(e));
        });

        this.updateSelectionState();
    }

    updatePagination(pagination) {
        this.totalPages = pagination.totalPages || 1;
        Utils.setElementText('page-info', `Page ${this.currentPage} of ${this.totalPages} (${pagination.totalCount} total)`);
        
        const prevPageBtn = Utils.getElement('prev-page');
        const nextPageBtn = Utils.getElement('next-page');
        
        if (prevPageBtn) prevPageBtn.disabled = this.currentPage <= 1;
        if (nextPageBtn) nextPageBtn.disabled = this.currentPage >= this.totalPages;
    }

    changePage(newPage) {
        if (newPage >= 1 && newPage <= this.totalPages) {
            this.currentPage = newPage;
            this.loadSamples();
        }
    }

    onFilterChange() {
        const typeFilter = Utils.getElement('type-filter');
        this.currentFilter = typeFilter ? typeFilter.value : '';
        this.currentPage = 1;
        this.loadSamples();
    }

    sortTable(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'desc';
        }

        const samplesTable = Utils.getElement('samples-table');
        if (samplesTable) {
            samplesTable.querySelectorAll('th[data-sort]').forEach(th => {
                th.classList.remove('sort-asc', 'sort-desc');
            });
            const currentTh = samplesTable.querySelector(`th[data-sort="${column}"]`);
            if (currentTh) {
                currentTh.classList.add(`sort-${this.sortDirection}`);
            }
        }

        this.loadSamples();
    }

    handleSampleSelection(event) {
        const sampleId = event.target.dataset.sampleId;
        const row = event.target.closest('tr');
        
        if (event.target.checked) {
            this.selectedSamples.add(sampleId);
            row.classList.add('selected');
        } else {
            this.selectedSamples.delete(sampleId);
            row.classList.remove('selected');
        }
        
        this.updateSelectionState();
    }

    handleSelectAll(event) {
        const isChecked = event.target.checked;
        
        document.querySelectorAll('.sample-checkbox').forEach(checkbox => {
            checkbox.checked = isChecked;
            const sampleId = checkbox.dataset.sampleId;
            const row = checkbox.closest('tr');
            
            if (isChecked) {
                this.selectedSamples.add(sampleId);
                row.classList.add('selected');
            } else {
                this.selectedSamples.delete(sampleId);
                row.classList.remove('selected');
            }
        });
        
        this.updateSelectionState();
    }

    updateSelectionState() {
        const headerSelectAll = Utils.getElement('header-select-all');
        const deleteSelectedBtn = Utils.getElement('delete-selected-btn');
        
        if (!headerSelectAll || !deleteSelectedBtn) return;

        const allCheckboxes = document.querySelectorAll('.sample-checkbox');
        const allSelected = this.selectedSamples.size > 0 && this.selectedSamples.size === allCheckboxes.length;
        const someSelected = this.selectedSamples.size > 0 && this.selectedSamples.size < allCheckboxes.length;

        headerSelectAll.checked = allSelected;
        headerSelectAll.indeterminate = someSelected;

        if (this.selectedSamples.size > 0) {
            deleteSelectedBtn.classList.remove('hidden');
            deleteSelectedBtn.textContent = `Delete Selected (${this.selectedSamples.size})`;
        } else {
            deleteSelectedBtn.classList.add('hidden');
        }
    }

    async deleteSelectedSamples() {
        const deleteSelectedBtn = Utils.getElement('delete-selected-btn');
        if (!deleteSelectedBtn || this.selectedSamples.size === 0) {
            this.notificationManager.showError('No samples selected for deletion');
            return;
        }

        try {
            deleteSelectedBtn.disabled = true;
            deleteSelectedBtn.textContent = 'Deleting...';

            const samplesToDelete = [];
            this.selectedSamples.forEach(sampleId => {
                const sample = this.currentSamples.find(s => s.id == sampleId);
                if (sample) {
                    samplesToDelete.push(sample);
                } else {
                    console.warn(`Sample with ID ${sampleId} not found in current samples`);
                }
            });

            if (samplesToDelete.length === 0) {
                this.notificationManager.showError('No valid samples found for deletion');
                return;
            }

            console.log('Samples to delete:', samplesToDelete);
            const response = await this.apiClient.deleteSamples(samplesToDelete);
            console.log('Delete response:', response);

            this.notificationManager.showSuccess(`Successfully deleted ${response.deletedCount} samples using ${response.method}`);
            this.selectedSamples.clear();
            await this.loadSamples();
        } catch (error) {
            console.error('Delete error:', error);
            this.notificationManager.showError('Failed to delete samples: ' + error.message, error.rateLimitInfo);
        } finally {
            deleteSelectedBtn.disabled = false;
            this.updateSelectionState();
        }
    }

    async previewDeletion(date, types = []) {
        if (!date) {
            throw new Error('Please select a date for deletion preview.');
        }

        const selectedTypes = types.filter(value => value);
        const countData = await this.apiClient.getSampleCountByDate(date, selectedTypes);
        
        return {
            totalCount: countData.totalCount,
            byType: countData.byType,
            types: selectedTypes
        };
    }

    async deleteSamplesByDate(date, types = []) {
        if (!date) {
            throw new Error('Please select a date for deletion.');
        }

        const selectedTypes = types.filter(value => value);
        const response = await this.apiClient.deleteSamplesByDate(date, selectedTypes);
        
        await this.loadSamples();
        
        return response;
    }
}
