let currentPage = 1;
let currentFilter = '';
let totalPages = 1;
let sortColumn = 'timestamp';
let sortDirection = 'desc';
let selectedSamples = new Set();
let currentSamples = [];

const errorBanner = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const closeError = document.getElementById('close-error');
const userNameSpan = document.getElementById('user-name');
const generateJwtBtn = document.getElementById('generate-jwt-btn');
const refreshFitbitBtn = document.getElementById('refresh-fitbit-btn');
const dateSyncBtn = document.getElementById('date-sync-btn');
const dateSyncModal = document.getElementById('date-sync-modal');
const closeModal = document.getElementById('close-modal');
const cancelSync = document.getElementById('cancel-sync');
const startSync = document.getElementById('start-sync');
const sampleTypeSelect = document.getElementById('sample-type-select');
const singleDateInput = document.getElementById('single-date');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const singleDateSection = document.getElementById('single-date-section');
const dateRangeSection = document.getElementById('date-range-section');
const jwtDisplay = document.getElementById('jwt-display');
const jwtToken = document.getElementById('jwt-token');
const copyJwtBtn = document.getElementById('copy-jwt-btn');
const typeFilter = document.getElementById('type-filter');
const refreshSamplesBtn = document.getElementById('refresh-samples-btn');
const loading = document.getElementById('loading');
const samplesTable = document.getElementById('samples-table');
const samplesTbody = document.getElementById('samples-tbody');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');
const selectionControls = document.getElementById('selection-controls');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const headerSelectAll = document.getElementById('header-select-all');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');

// Rate limit status elements
const rateLimitStatus = document.getElementById('rate-limit-status');
const refreshStatusBtn = document.getElementById('refresh-status-btn');
const rateLimitUsage = document.getElementById('rate-limit-usage');
const rateLimitRemaining = document.getElementById('rate-limit-remaining');
const rateLimitHealth = document.getElementById('rate-limit-health');
const rateLimitReset = document.getElementById('rate-limit-reset');

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthStatus();
    await loadRateLimitStatus();
    await loadSampleTypes();
    await loadSamples();
    setupEventListeners();
});

function setupEventListeners() {
    closeError.addEventListener('click', hideError);
    generateJwtBtn.addEventListener('click', generateJWT);
    refreshFitbitBtn.addEventListener('click', refreshFitbitTokens);
    dateSyncBtn.addEventListener('click', openDateSyncModal);
    closeModal.addEventListener('click', closeDateSyncModal);
    cancelSync.addEventListener('click', closeDateSyncModal);
    startSync.addEventListener('click', performDateSync);
    copyJwtBtn.addEventListener('click', copyJWT);
    typeFilter.addEventListener('change', onFilterChange);
    refreshSamplesBtn.addEventListener('click', () => loadSamples());
    prevPageBtn.addEventListener('click', () => changePage(currentPage - 1));
    nextPageBtn.addEventListener('click', () => changePage(currentPage + 1));
    
    // Selection event listeners
    selectAllCheckbox.addEventListener('change', handleSelectAll);
    headerSelectAll.addEventListener('change', handleSelectAll);
    deleteSelectedBtn.addEventListener('click', deleteSelectedSamples);
    
    // Date sync modal event listeners
    document.querySelectorAll('input[name="sync-type"]').forEach(radio => {
        radio.addEventListener('change', toggleSyncType);
    });
    
    // Close modal when clicking outside
    dateSyncModal.addEventListener('click', (e) => {
        if (e.target === dateSyncModal) {
            closeDateSyncModal();
        }
    });
    
    // Set default dates
    initializeDateInputs();
    
    samplesTable.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => sortTable(th.dataset.sort));
    });
    
    refreshStatusBtn.addEventListener('click', loadRateLimitStatus);
}

function showError(message, rateLimitInfo = null) {
    // If we have detailed rate limit info, enhance the message
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

function hideError() {
    errorBanner.classList.add('hidden');
    errorBanner.classList.remove('rate-limit-error');
}

async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            credentials: 'include',
            ...options
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            // Log the full error response for debugging
            console.error('Full error response:', errorData);
            
            // If there are errors array, log each error
            if (errorData.errors && Array.isArray(errorData.errors)) {
                console.error('Error details:', errorData.errors);
                errorData.errors.forEach((err, index) => {
                    console.error(`Error ${index + 1}:`, err);
                });
            }
            
            // Log detailed rate limit information if available
            if (errorData.rateLimitInfo) {
                console.error('🚫 Rate Limit Details:', errorData.rateLimitInfo);
                console.error(`   Usage: ${errorData.rateLimitInfo.used}/${errorData.rateLimitInfo.total} requests`);
                console.error(`   Remaining: ${errorData.rateLimitInfo.remaining} requests`);
                console.error(`   Reset time: ${errorData.rateLimitInfo.resetTime} seconds`);
                console.error(`   Reset date: ${new Date(errorData.rateLimitInfo.resetDate).toLocaleString()}`);
            }
            
            // Create enhanced error with rate limit info
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

async function checkAuthStatus() {
    try {
        const data = await apiCall('/auth/auth-status');
        userNameSpan.textContent = data.user?.name || data.user?.email || 'User';
    } catch (error) {
        // If authentication fails, redirect to login instead of showing error
        if (error.message.includes('401') || error.message.includes('Not authenticated')) {
            window.location.href = '/auth/login';
            return;
        }
        showError('Failed to check authentication status: ' + error.message, error.rateLimitInfo);
    }
}

// JWT generation
async function generateJWT() {
    try {
        generateJwtBtn.disabled = true;
        generateJwtBtn.textContent = 'Generating...';
        
        const data = await apiCall('/auth/newtoken');
        jwtToken.value = data.accessToken;
        jwtDisplay.classList.remove('hidden');
        
        showSuccess('JWT token generated successfully!');
    } catch (error) {
        showError('Failed to generate JWT: ' + error.message, error.rateLimitInfo);
    } finally {
        generateJwtBtn.disabled = false;
        generateJwtBtn.textContent = 'Generate New JWT';
    }
}

function copyJWT() {
    jwtToken.select();
    document.execCommand('copy');
    
    const originalText = copyJwtBtn.textContent;
    copyJwtBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyJwtBtn.textContent = originalText;
    }, 2000);
}

async function refreshFitbitTokens() {
    try {
        refreshFitbitBtn.disabled = true;
        refreshFitbitBtn.textContent = 'Redirecting...';
        
        window.location.href = '/auth/refreshtokens';
    } catch (error) {
        showError('Failed to refresh Fitbit tokens: ' + error.message, error.rateLimitInfo);
        refreshFitbitBtn.disabled = false;
        refreshFitbitBtn.textContent = 'Refresh Fitbit Tokens';
    }
}


async function loadSampleTypes() {
    try {
        const data = await apiCall('/api/sample-types');
        
        // Clear existing options except "All Types"
        typeFilter.innerHTML = '<option value="">All Types</option>';
        
        // Add sample types
        data.types.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeFilter.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load sample types:', error);
        // Don't show error for this, it's not critical
    }
}

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
        // If authentication fails, redirect to login instead of showing error
        if (error.message.includes('401') || error.message.includes('Not authenticated')) {
            window.location.href = '/auth/login';
            return;
        }
        showError('Failed to load samples: ' + error.message, error.rateLimitInfo);
        samplesTbody.innerHTML = '<tr><td colspan="3">Failed to load samples</td></tr>';
    } finally {
        showLoading(false);
    }
}

function showLoading(show) {
    loading.classList.toggle('hidden', !show);
    samplesTable.style.opacity = show ? '0.5' : '1';
}

function displaySamples(samples) {
    if (!samples || samples.length === 0) {
        samplesTbody.innerHTML = '<tr><td colspan="4">No samples found</td></tr>';
        selectionControls.classList.add('hidden');
        return;
    }
    
    // Store current samples for selection tracking
    currentSamples = samples;
    
    // Clear previous selections when loading new data
    selectedSamples.clear();
    
    samplesTbody.innerHTML = samples.map((sample, index) => {
        const timestamp = sample.timestamp || sample.startTime || 'N/A';
        const formattedTimestamp = timestamp !== 'N/A' ? 
            new Date(timestamp).toLocaleString() : 'N/A';
        
        // Use the database ID as the unique identifier
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
    
    // Show selection controls
    selectionControls.classList.remove('hidden');
    
    // Add event listeners to checkboxes
    document.querySelectorAll('.sample-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', handleSampleSelection);
    });
    
    // Update selection state
    updateSelectionState();
}

function updatePagination(pagination) {
    currentPage = pagination.currentPage;
    totalPages = pagination.totalPages;
    
    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${pagination.totalCount} total)`;
    
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
}

// Pagination
function changePage(newPage) {
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        loadSamples();
    }
}

// Filtering
function onFilterChange() {
    currentFilter = typeFilter.value;
    currentPage = 1; // Reset to first page
    loadSamples();
}

// Sorting
function sortTable(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'desc';
    }
    
    // Update visual indicators
    samplesTable.querySelectorAll('th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    const currentTh = samplesTable.querySelector(`th[data-sort="${column}"]`);
    currentTh.classList.add(`sort-${sortDirection}`);
    
    loadSamples();
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showSuccess(message) {
    // Create a temporary success banner
    const successBanner = document.createElement('div');
    successBanner.className = 'error-banner';
    successBanner.style.backgroundColor = '#d4edda';
    successBanner.style.borderColor = '#c3e6cb';
    successBanner.style.color = '#155724';
    successBanner.innerHTML = `
        <span>${message}</span>
        <button class="close-btn" onclick="this.parentElement.remove()">&times;</button>
    `;
    
    document.querySelector('.container').insertBefore(successBanner, document.querySelector('.header'));
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (successBanner.parentElement) {
            successBanner.remove();
        }
    }, 5000);
}

// Date Sync Modal Functions
function initializeDateInputs() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Set default single date to yesterday (for better data availability)
    singleDateInput.value = formatDateForInput(yesterday);
    
    // Set default range to last 7 days
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    startDateInput.value = formatDateForInput(weekAgo);
    endDateInput.value = formatDateForInput(yesterday);
    
    // Set max date to today for all inputs
    const todayStr = formatDateForInput(today);
    singleDateInput.max = todayStr;
    startDateInput.max = todayStr;
    endDateInput.max = todayStr;
}

function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

function openDateSyncModal() {
    dateSyncModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function closeDateSyncModal() {
    dateSyncModal.classList.add('hidden');
    document.body.style.overflow = ''; // Restore scrolling
}

function toggleSyncType() {
    const syncType = document.querySelector('input[name="sync-type"]:checked').value;
    
    if (syncType === 'single') {
        singleDateSection.classList.remove('hidden');
        dateRangeSection.classList.add('hidden');
    } else {
        singleDateSection.classList.add('hidden');
        dateRangeSection.classList.remove('hidden');
    }
}

async function performDateSync() {
    const syncType = document.querySelector('input[name="sync-type"]:checked').value;
    const selectedSampleType = sampleTypeSelect.value;
    
    try {
        startSync.disabled = true;
        startSync.textContent = 'Syncing...';
        
        let requestBody = {};
        let successMessage = '';
        
        // Add sample type selection to request body
        if (selectedSampleType && selectedSampleType !== 'all') {
            requestBody.sampleTypes = [selectedSampleType];
        }
        
        if (syncType === 'single') {
            const date = singleDateInput.value;
            if (!date) {
                showError('Please select a date');
                return;
            }
            
            requestBody.date = date;
            const sampleTypeText = selectedSampleType === 'all' ? 'all sample types' : selectedSampleType;
            successMessage = `Date sync completed for ${date} (${sampleTypeText})!`;
        } else {
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;
            
            if (!startDate || !endDate) {
                showError('Please select both start and end dates');
                return;
            }
            
            if (new Date(startDate) > new Date(endDate)) {
                showError('Start date must be before or equal to end date');
                return;
            }
            
            // Calculate days difference
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
        
        // Show detailed success message
        if (data.results && data.results.totalSamples !== undefined) {
            successMessage += ` ${data.results.totalSamples} total samples processed.`;
        } else if (data.results) {
            const syncCount = Object.keys(data.results).length;
            successMessage += ` ${syncCount} data types synced.`;
        }
        
        showSuccess(successMessage);
        
        // Refresh the samples table and rate limit status to show new data
        await loadSamples();
        await loadRateLimitStatus();
        
    } catch (error) {
        showError('Failed to perform date sync: ' + error.message, error.rateLimitInfo);
    } finally {
        startSync.disabled = false;
        startSync.textContent = 'Start Sync';
    }
}

// Selection Functions
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

function handleSelectAll(event) {
    const isChecked = event.target.checked;
    
    // Update both checkboxes to stay in sync
    selectAllCheckbox.checked = isChecked;
    headerSelectAll.checked = isChecked;
    
    // Select/deselect all sample checkboxes
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

function updateSelectionState() {
    const totalSamples = document.querySelectorAll('.sample-checkbox').length;
    const selectedCount = selectedSamples.size;
    
    // Update select all checkboxes
    const allSelected = selectedCount > 0 && selectedCount === totalSamples;
    const someSelected = selectedCount > 0 && selectedCount < totalSamples;
    
    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = someSelected;
    headerSelectAll.checked = allSelected;
    headerSelectAll.indeterminate = someSelected;
    
    // Show/hide delete button
    if (selectedCount > 0) {
        deleteSelectedBtn.classList.remove('hidden');
        deleteSelectedBtn.textContent = `Delete Selected (${selectedCount})`;
    } else {
        deleteSelectedBtn.classList.add('hidden');
    }
}

async function deleteSelectedSamples() {
    if (selectedSamples.size === 0) {
        showError('No samples selected for deletion');
        return;
    }
    
    // Show confirmation dialog
    const confirmMessage = `Are you sure you want to delete ${selectedSamples.size} selected sample(s)? This action cannot be undone.`;
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        deleteSelectedBtn.disabled = true;
        deleteSelectedBtn.textContent = 'Deleting...';
        
        // Get the actual sample data for selected items using database IDs
        const samplesToDelete = [];
        selectedSamples.forEach(sampleId => {
            // Find the sample by its database ID
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
        
        // Send DELETE request to the API
        const response = await apiCall('/api/samples', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ samples: samplesToDelete })
        });
        
        console.log('Delete response:', response);
        
        showSuccess(`Successfully deleted ${response.deletedCount} samples using ${response.method}`);
        
        // Clear selections and refresh the table
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

// Handle browser back/forward
window.addEventListener('popstate', () => {
    loadSamples();
});

async function loadRateLimitStatus() {
    try {
        const data = await apiCall('/api/status');
        const rateLimit = data.rateLimit;
        
        // Update the display
        rateLimitUsage.textContent = `${rateLimit.used}/${rateLimit.total} (${rateLimit.percentageUsed}%)`;
        rateLimitRemaining.textContent = `${rateLimit.remaining} requests`;
        
        // Update status badge
        rateLimitHealth.textContent = rateLimit.status;
        rateLimitHealth.className = `status-badge status-${rateLimit.status}`;
        
        // Update reset time
        if (rateLimit.resetDateFormatted) {
            rateLimitReset.textContent = rateLimit.resetDateFormatted;
        } else {
            rateLimitReset.textContent = 'Unknown';
        }
        
        // Show warning if data is stale
        if (rateLimit.isStale) {
            rateLimitReset.textContent += ' (estimated)';
        }
        
        console.log(`🔄 Rate limit status updated: ${rateLimit.remaining}/150 remaining (${rateLimit.status})`);
        
    } catch (error) {
        console.error('Failed to load rate limit status:', error);
        rateLimitUsage.textContent = 'Error loading';
        rateLimitRemaining.textContent = 'Error loading';
        rateLimitHealth.textContent = 'Error';
        rateLimitHealth.className = 'status-badge status-error';
        rateLimitReset.textContent = 'Error loading';
    }
}
