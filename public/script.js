let currentPage = 1;
let currentFilter = '';
let totalPages = 1;
let sortColumn = 'timestamp';
let sortDirection = 'desc';
let selectedSamples = new Set();
let currentSamples = [];

// Initialize the app on DOM load
// Loads authentication, rate limit, sample types, and sample data
// Sets up all event listeners for UI controls
// Main entry point

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthStatus();
    await loadRateLimitStatus();
    await loadSampleTypes();
    await loadSamples();
    setupEventListeners();
});

// Attach all event listeners for UI controls and modals
function setupEventListeners() {
    document.getElementById('close-error').addEventListener('click', hideError);
    document.getElementById('generate-jwt-btn').addEventListener('click', generateJWT);
    document.getElementById('refresh-fitbit-btn').addEventListener('click', refreshFitbitTokens);
    document.getElementById('date-sync-btn').addEventListener('click', openDateSyncModal);
    document.getElementById('close-modal').addEventListener('click', closeDateSyncModal);
    document.getElementById('cancel-sync').addEventListener('click', closeDateSyncModal);
    document.getElementById('start-sync').addEventListener('click', performDateSync);
    document.getElementById('copy-jwt-btn').addEventListener('click', copyJWT);
    document.getElementById('type-filter').addEventListener('change', onFilterChange);
    document.getElementById('refresh-samples-btn').addEventListener('click', () => loadSamples());
    document.getElementById('prev-page').addEventListener('click', () => changePage(currentPage - 1));
    document.getElementById('next-page').addEventListener('click', () => changePage(currentPage + 1));
    document.getElementById('header-select-all').addEventListener('change', handleSelectAll);
    document.getElementById('delete-selected-btn').addEventListener('click', deleteSelectedSamples);
    document.getElementById('preview-deletion-btn')?.addEventListener('click', previewDeletion);
    document.getElementById('delete-by-date-btn')?.addEventListener('click', deleteSamplesByDate);
    document.getElementById('delete-samples-btn')?.addEventListener('click', openDeleteSamplesModal);
    document.getElementById('close-delete-modal')?.addEventListener('click', closeDeleteSamplesModal);
    document.getElementById('cancel-delete')?.addEventListener('click', closeDeleteSamplesModal);
    document.querySelectorAll('input[name="sync-type"]').forEach(radio => {
        radio.addEventListener('change', toggleSyncType);
    });
    const dateSyncModal = document.getElementById('date-sync-modal');
    dateSyncModal.addEventListener('click', (e) => {
        if (e.target === dateSyncModal) {
            closeDateSyncModal();
        }
    });
    const deleteSamplesModal = document.getElementById('delete-samples-modal');
    deleteSamplesModal?.addEventListener('click', (e) => {
        if (e.target === deleteSamplesModal) {
            closeDeleteSamplesModal();
        }
    });
    initializeDateInputs();
    const samplesTable = document.getElementById('samples-table');
    samplesTable.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => sortTable(th.dataset.sort));
    });
    document.getElementById('refresh-status-btn').addEventListener('click', loadRateLimitStatus);
}

// Display an error banner with optional rate limit details
function showError(message, rateLimitInfo = null) {
    const errorBanner = document.getElementById('error-banner');
    const errorMessage = document.getElementById('error-message');
    if (rateLimitInfo) {
        const resetDate = new Date(rateLimitInfo.resetDate);
        const usagePercentage = Math.round((rateLimitInfo.used / rateLimitInfo.total) * 100);
        const detailedMessage = `
            <div class="error-main">${message}</div>
            <div class="rate-limit-details">
                <div class="rate-limit-header">📊 Rate Limit Details:</div>
                <div class="rate-limit-item"><strong>Usage:</strong> ${rateLimitInfo.used}/${rateLimitInfo.total} requests (${usagePercentage}%)</div>
                <div class="rate-limit-item"><strong>Remaining:</strong> ${rateLimitInfo.remaining} requests</div>
                ${rateLimitInfo.needed ? `<div class="rate-limit-item"><strong>Needed:</strong> ${rateLimitInfo.needed} requests</div>` : ''}
                <div class="rate-limit-item"><strong>Reset Time:</strong> ${rateLimitInfo.resetTime} seconds</div>
                <div class="rate-limit-item"><strong>Reset Date:</strong> ${resetDate.toLocaleString()}</div>
            </div>
        `;
        errorMessage.innerHTML = detailedMessage;
        errorBanner.classList.add('rate-limit-error');
    } else {
        errorMessage.textContent = message;
        errorBanner.classList.remove('rate-limit-error');
    }
    errorBanner.classList.remove('hidden');
}

// Hide the error banner
function hideError() {
    const errorBanner = document.getElementById('error-banner');
    errorBanner.classList.add('hidden');
    errorBanner.classList.remove('rate-limit-error');
}

// Wrapper for API calls with error handling and rate limit info
async function apiCall(url, options = {}) {
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

// Check authentication status and update UI, redirect if not authenticated
async function checkAuthStatus() {
    try {
        const data = await apiCall('/auth/auth-status');
        const userNameSpan = document.getElementById('user-name');
        userNameSpan.textContent = data.user?.name || data.user?.email || 'User';
    } catch (error) {
        if (error.message.includes('401') || error.message.includes('Not authenticated')) {
            window.location.href = '/auth/login';
            return;
        }
        showError('Failed to check authentication status: ' + error.message, error.rateLimitInfo);
    }
}

// Request a new JWT from the server and display it
async function generateJWT() {
    try {
        const generateJwtBtn = document.getElementById('generate-jwt-btn');
        generateJwtBtn.disabled = true;
        generateJwtBtn.textContent = 'Generating...';
        const data = await apiCall('/auth/newtoken');
        const jwtToken = document.getElementById('jwt-token');
        const jwtDisplay = document.getElementById('jwt-display');
        jwtToken.value = data.accessToken;
        jwtDisplay.classList.remove('hidden');
        showSuccess('JWT token generated successfully!');
    } catch (error) {
        showError('Failed to generate JWT: ' + error.message, error.rateLimitInfo);
    } finally {
        const generateJwtBtn = document.getElementById('generate-jwt-btn');
        generateJwtBtn.disabled = false;
        generateJwtBtn.textContent = 'Generate New JWT';
    }
}

// Copy the JWT to clipboard and show feedback
function copyJWT() {
    const jwtToken = document.getElementById('jwt-token');
    const copyJwtBtn = document.getElementById('copy-jwt-btn');
    jwtToken.select();
    document.execCommand('copy');
    const originalText = copyJwtBtn.textContent;
    copyJwtBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyJwtBtn.textContent = originalText;
    }, 2000);
}

// Redirect to refresh Fitbit tokens
async function refreshFitbitTokens() {
    try {
        const refreshFitbitBtn = document.getElementById('refresh-fitbit-btn');
        refreshFitbitBtn.disabled = true;
        refreshFitbitBtn.textContent = 'Redirecting...';
        window.location.href = '/auth/refreshtokens';
    } catch (error) {
        showError('Failed to refresh Fitbit tokens: ' + error.message, error.rateLimitInfo);
        const refreshFitbitBtn = document.getElementById('refresh-fitbit-btn');
        refreshFitbitBtn.disabled = false;
        refreshFitbitBtn.textContent = 'Refresh Fitbit Tokens';
    }
}

// Load available sample types for filtering and deletion
async function loadSampleTypes() {
    try {
        const data = await apiCall('/api/sample-types');
        const typeFilter = document.getElementById('type-filter');
        typeFilter.innerHTML = '<option value="">All Types</option>';
        const deleteTypesSelect = document.getElementById('delete-types');
        if (deleteTypesSelect) {
            deleteTypesSelect.innerHTML = '<option value="">All Types (select none to delete all)</option>';
        }
        data.types.forEach(type => {
            const filterOption = document.createElement('option');
            filterOption.value = type;
            filterOption.textContent = type;
            typeFilter.appendChild(filterOption);
            if (deleteTypesSelect) {
                const deleteOption = document.createElement('option');
                deleteOption.value = type;
                deleteOption.textContent = type;
                deleteTypesSelect.appendChild(deleteOption);
            }
        });
    } catch (error) {
        console.error('Failed to load sample types:', error);
    }
}

// Load samples for the current page, filter, and sort
async function loadSamples() {
    try {
        showLoading(true);
        hideError();
        const params = new URLSearchParams({
            page: currentPage,
            limit: 100,
            sort: sortColumn,
            direction: sortDirection
        });
        if (currentFilter) {
            params.append('type', currentFilter);
        }
        const data = await apiCall(`/api/samples?${params.toString()}`);
        displaySamples(data.samples);
        updatePagination(data.pagination);
    } catch (error) {
        if (error.message.includes('401') || error.message.includes('Not authenticated')) {
            window.location.href = '/auth/login';
            return;
        }
        showError('Failed to load samples: ' + error.message, error.rateLimitInfo);
        const samplesTbody = document.getElementById('samples-tbody');
        samplesTbody.innerHTML = '<tr><td colspan="3">Failed to load samples</td></tr>';
    } finally {
        showLoading(false);
    }
}

// Show or hide the loading overlay on the samples table
function showLoading(show) {
    const loading = document.getElementById('loading');
    const samplesTable = document.getElementById('samples-table');
    loading.classList.toggle('hidden', !show);
    samplesTable.style.opacity = show ? '0.5' : '1';
}

// Render the samples table and set up selection controls
function displaySamples(samples) {
    const samplesTbody = document.getElementById('samples-tbody');
    const selectionControls = document.getElementById('selection-controls');
    if (!samples || samples.length === 0) {
        samplesTbody.innerHTML = '<tr><td colspan="4">No samples found</td></tr>';
        selectionControls.classList.add('hidden');
        return;
    }
    currentSamples = samples;
    selectedSamples.clear();
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
                <td>${escapeHtml(sample.type)}</td>
                <td>${sample.value}</td>
                <td>${formattedTimestamp}</td>
            </tr>
        `;
    }).join('');
    selectionControls.classList.remove('hidden');
    document.querySelectorAll('.sample-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', handleSampleSelection);
    });
    updateSelectionState();
}

// Update pagination controls and display
function updatePagination(pagination) {
    const pageInfo = document.getElementById('page-info');
    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${pagination.totalCount} total)`;
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;
}

// Change the current page and reload samples
function changePage(newPage) {
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        loadSamples();
    }
}

// Update filter and reload samples
function onFilterChange() {
    currentFilter = document.getElementById('type-filter').value;
    currentPage = 1;
    loadSamples();
}

// Sort the samples table by column and direction
function sortTable(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'desc';
    }
    const samplesTable = document.getElementById('samples-table');
    samplesTable.querySelectorAll('th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    const currentTh = samplesTable.querySelector(`th[data-sort="${column}"]`);
    currentTh.classList.add(`sort-${sortDirection}`);
    loadSamples();
}

// Escape HTML for safe rendering
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show a notification overlay (success or error)
function showNotification(message, type = 'success', duration = 3000) {
    const existingNotifications = document.querySelectorAll('.notification-overlay');
    existingNotifications.forEach(notification => notification.remove());
    const notification = document.createElement('div');
    notification.className = `notification-overlay notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
    `;
    document.body.appendChild(notification);
    requestAnimationFrame(() => {
        notification.classList.add('notification-show');
    });
    if (type === 'success' && duration > 0) {
        setTimeout(() => {
            if (notification.parentElement) {
                notification.classList.remove('notification-show');
                setTimeout(() => {
                    if (notification.parentElement) {
                        notification.remove();
                    }
                }, 300);
            }
        }, duration);
    }
}

// Show a success notification
function showSuccess(message) {
    showNotification(message, 'success', 3000);
}

// Initialize date input fields for modals
function initializeDateInputs() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    document.getElementById('single-date').value = formatDateForInput(yesterday);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    document.getElementById('start-date').value = formatDateForInput(weekAgo);
    document.getElementById('end-date').value = formatDateForInput(yesterday);
    const todayStr = formatDateForInput(today);
    document.getElementById('single-date').max = todayStr;
    document.getElementById('start-date').max = todayStr;
    document.getElementById('end-date').max = todayStr;
}

// Format a Date object for input[type="date"]
function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

// Open the date sync modal
function openDateSyncModal() {
    const dateSyncModal = document.getElementById('date-sync-modal');
    dateSyncModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// Close the date sync modal
function closeDateSyncModal() {
    const dateSyncModal = document.getElementById('date-sync-modal');
    dateSyncModal.classList.add('hidden');
    document.body.style.overflow = '';
}

// Open the delete samples modal and set up defaults
function openDeleteSamplesModal() {
    const deleteSamplesModal = document.getElementById('delete-samples-modal');
    deleteSamplesModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    const deleteDateInput = document.getElementById('delete-date');
    if (!deleteDateInput.value) {
        const today = new Date();
        deleteDateInput.value = formatDateForInput(today);
        deleteDateInput.max = formatDateForInput(today);
    }
    const deletionPreview = document.getElementById('deletion-preview');
    deletionPreview.classList.add('hidden');
}

// Close the delete samples modal and clear form
function closeDeleteSamplesModal() {
    const deleteSamplesModal = document.getElementById('delete-samples-modal');
    deleteSamplesModal.classList.add('hidden');
    document.body.style.overflow = '';
    document.getElementById('delete-date').value = '';
    document.getElementById('delete-types').selectedIndex = -1;
    const deletionPreview = document.getElementById('deletion-preview');
    deletionPreview.classList.add('hidden');
}

// Toggle between single date and date range sync UI
function toggleSyncType() {
    const syncType = document.querySelector('input[name="sync-type"]:checked').value;
    if (syncType === 'single') {
        document.getElementById('single-date-section').classList.remove('hidden');
        document.getElementById('date-range-section').classList.add('hidden');
    } else {
        document.getElementById('single-date-section').classList.add('hidden');
        document.getElementById('date-range-section').classList.remove('hidden');
    }
}

// Trigger a sync for the selected date(s) and sample type
async function performDateSync() {
    const syncType = document.querySelector('input[name="sync-type"]:checked').value;
    const selectedSampleType = document.getElementById('sample-type-select').value;
    try {
        document.getElementById('start-sync').disabled = true;
        document.getElementById('start-sync').textContent = 'Syncing...';
        let requestBody = {};
        let successMessage = '';
        if (selectedSampleType && selectedSampleType !== 'all') {
            requestBody.sampleTypes = [selectedSampleType];
        }
        if (syncType === 'single') {
            const date = document.getElementById('single-date').value;
            if (!date) {
                showError('Please select a date');
                return;
            }
            requestBody.date = date;
            const sampleTypeText = selectedSampleType === 'all' ? 'all sample types' : selectedSampleType;
            successMessage = `Date sync completed for ${date} (${sampleTypeText})!`;
        } else {
            const startDate = document.getElementById('start-date').value;
            const endDate = document.getElementById('end-date').value;
            if (!startDate || !endDate) {
                showError('Please select both start and end dates');
                return;
            }
            if (new Date(startDate) > new Date(endDate)) {
                showError('Start date must be before or equal to end date');
                return;
            }
            const daysDiff = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
            if (daysDiff > 30) {
                showError('Date range too large. Maximum 30 days allowed.');
                return;
            }
            requestBody.startDate = startDate;
            requestBody.endDate = endDate;
            const sampleTypeText = selectedSampleType === 'all' ? 'all sample types' : selectedSampleType;
            successMessage = `Date range sync completed for ${startDate} to ${endDate} (${sampleTypeText})! (${daysDiff} days)`;
        }
        const data = await apiCall('/api/sync/trigger', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        closeDateSyncModal();
        if (data.results && data.results.totalSamples !== undefined) {
            successMessage += ` ${data.results.totalSamples} total samples processed.`;
        } else if (data.results) {
            const syncCount = Object.keys(data.results).length;
            successMessage += ` ${syncCount} data types synced.`;
        }
        showSuccess(successMessage);
        await loadSamples();
        await loadRateLimitStatus();
    } catch (error) {
        showError('Failed to perform date sync: ' + error.message, error.rateLimitInfo);
    } finally {
        document.getElementById('start-sync').disabled = false;
        document.getElementById('start-sync').textContent = 'Start Sync';
    }
}

// Handle selection of individual samples in the table
function handleSampleSelection(event) {
    const sampleId = event.target.dataset.sampleId;
    const row = event.target.closest('tr');
    if (event.target.checked) {
        selectedSamples.add(sampleId);
        row.classList.add('selected');
    } else {
        selectedSamples.delete(sampleId);
        row.classList.remove('selected');
    }
    updateSelectionState();
}

// Handle select-all checkbox for samples
function handleSelectAll(event) {
    const isChecked = event.target.checked;
    document.querySelectorAll('.sample-checkbox').forEach(checkbox => {
        checkbox.checked = isChecked;
        const sampleId = checkbox.dataset.sampleId;
        const row = checkbox.closest('tr');
        if (isChecked) {
            selectedSamples.add(sampleId);
            row.classList.add('selected');
        } else {
            selectedSamples.delete(sampleId);
            row.classList.remove('selected');
        }
    });
    updateSelectionState();
}

// Update selection state and UI for selected samples
function updateSelectionState() {
    const headerSelectAll = document.getElementById('header-select-all');
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');
    const allSelected = selectedSamples.size > 0 && selectedSamples.size === document.querySelectorAll('.sample-checkbox').length;
    const someSelected = selectedSamples.size > 0 && selectedSamples.size < document.querySelectorAll('.sample-checkbox').length;
    headerSelectAll.checked = allSelected;
    headerSelectAll.indeterminate = someSelected;
    if (selectedSamples.size > 0) {
        deleteSelectedBtn.classList.remove('hidden');
        deleteSelectedBtn.textContent = `Delete Selected (${selectedSamples.size})`;
    } else {
        deleteSelectedBtn.classList.add('hidden');
    }
}

// Delete selected samples from the table and backend
async function deleteSelectedSamples() {
    const deleteSelectedBtn = document.getElementById('delete-selected-btn');
    if (selectedSamples.size === 0) {
        showError('No samples selected for deletion');
        return;
    }
    try {
        deleteSelectedBtn.disabled = true;
        deleteSelectedBtn.textContent = 'Deleting...';
        const samplesToDelete = [];
        selectedSamples.forEach(sampleId => {
            const sample = currentSamples.find(s => s.id == sampleId);
            if (sample) {
                samplesToDelete.push(sample);
            } else {
                console.warn(`Sample with ID ${sampleId} not found in current samples`);
            }
        });
        if (samplesToDelete.length === 0) {
            showError('No valid samples found for deletion');
            return;
        }
        console.log('Samples to delete:', samplesToDelete);
        const response = await apiCall('/api/samples', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ samples: samplesToDelete })
        });
        console.log('Delete response:', response);
        showSuccess(`Successfully deleted ${response.deletedCount} samples using ${response.method}`);
        selectedSamples.clear();
        await loadSamples();
    } catch (error) {
        console.error('Delete error:', error);
        showError('Failed to delete samples: ' + error.message, error.rateLimitInfo);
    } finally {
        deleteSelectedBtn.disabled = false;
        updateSelectionState();
    }
}

// Preview the number of samples that would be deleted for a given date and types
async function previewDeletion() {
    const deleteTypesSelect = document.getElementById('delete-types');
    const deletionPreview = document.getElementById('deletion-preview');
    const previewContent = document.getElementById('preview-content');
    try {
        const date = document.getElementById('delete-date').value;
        if (!date) {
            showError('Please select a date for deletion preview.');
            return;
        }
        const selectedTypes = Array.from(deleteTypesSelect.selectedOptions)
            .map(option => option.value)
            .filter(value => value);
        const params = new URLSearchParams({ 
            types: selectedTypes.join(',') 
        });
        const countData = await apiCall(`/api/samples/date/${date}/count?${params}`);
        deletionPreview.classList.remove('hidden');
        if (countData.totalCount === 0) {
            previewContent.innerHTML = `
                <div class="preview-summary">
                    <div class="preview-total">No samples found for ${date}</div>
                    <p>No samples will be deleted.</p>
                </div>
            `;
            return;
        }
        const typesText = selectedTypes.length > 0 ? selectedTypes.join(', ') : 'all types';
        let byTypeHtml = '';
        if (countData.byType.length > 0) {
            byTypeHtml = `
                <div class="preview-by-type">
                    ${countData.byType.map(typeInfo => `
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
                <div class="preview-total">⚠️ ${countData.totalCount} samples will be deleted for ${date}</div>
                <p><strong>Types to delete:</strong> ${typesText}</p>
                ${byTypeHtml}
            </div>
            <p><strong>⚠️ Warning:</strong> This action cannot be undone. All selected samples for this date will be permanently deleted.</p>
        `;
    } catch (error) {
        console.error('Failed to preview deletion:', error);
        showError(`Failed to preview deletion: ${error.message}`);
    }
}

// Delete samples by date and type from the backend
async function deleteSamplesByDate() {
    try {
        const date = document.getElementById('delete-date').value;
        if (!date) {
            showError('Please select a date for deletion.');
            return;
        }
        const deleteTypesSelect = document.getElementById('delete-types');
        const selectedTypes = Array.from(deleteTypesSelect.selectedOptions)
            .map(option => option.value)
            .filter(value => value);
        showLoading(true);
        hideError();
        const requestBody = {};
        if (selectedTypes.length > 0) {
            requestBody.types = selectedTypes;
        }
        const response = await fetch(`/api/samples/date/${date}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete samples');
        }
        showSuccess(data.message);
        closeDeleteSamplesModal();
        await loadSamples();
    } catch (error) {
        console.error('Failed to delete samples by date:', error);
        showError(`Failed to delete samples: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Reload samples on browser navigation
window.addEventListener('popstate', () => {
    loadSamples();
});

// Load and display current API rate limit status
async function loadRateLimitStatus() {
    const rateLimitHealth = document.getElementById('rate-limit-health');
    try {
        const data = await apiCall('/api/status');
        const rateLimit = data.rateLimit;
        document.getElementById('rate-limit-usage').textContent = `${rateLimit.used}/${rateLimit.total} (${rateLimit.percentageUsed}%)`;
        document.getElementById('rate-limit-remaining').textContent = `${rateLimit.remaining} requests`;
        rateLimitHealth.textContent = rateLimit.status;
        rateLimitHealth.className = `status-badge status-${rateLimit.status}`;
        if (rateLimit.resetDateFormatted) {
            document.getElementById('rate-limit-reset').textContent = rateLimit.resetDateFormatted;
        } else {
            document.getElementById('rate-limit-reset').textContent = 'Unknown';
        }
        if (rateLimit.isStale) {
            document.getElementById('rate-limit-reset').textContent += ' (estimated)';
        }
        console.log(`🔄 Rate limit status updated: ${rateLimit.remaining}/150 remaining (${rateLimit.status})`);
    } catch (error) {
        console.error('Failed to load rate limit status:', error);
        document.getElementById('rate-limit-usage').textContent = 'Error loading';
        document.getElementById('rate-limit-remaining').textContent = 'Error loading';
        rateLimitHealth.textContent = 'Error';
        rateLimitHealth.className = 'status-badge status-error';
        document.getElementById('rate-limit-reset').textContent = 'Error loading';
    }
}
