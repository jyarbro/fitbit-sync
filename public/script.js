let currentPage = 1;
let currentFilter = '';
let totalPages = 1;
let sortColumn = 'timestamp';
let sortDirection = 'desc';

const errorBanner = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const closeError = document.getElementById('close-error');
const userNameSpan = document.getElementById('user-name');
const generateJwtBtn = document.getElementById('generate-jwt-btn');
const refreshFitbitBtn = document.getElementById('refresh-fitbit-btn');
const manualSyncBtn = document.getElementById('manual-sync-btn');
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

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthStatus();
    await loadSampleTypes();
    await loadSamples();
    setupEventListeners();
});

function setupEventListeners() {
    closeError.addEventListener('click', hideError);
    generateJwtBtn.addEventListener('click', generateJWT);
    refreshFitbitBtn.addEventListener('click', refreshFitbitTokens);
    manualSyncBtn.addEventListener('click', manualSync);
    copyJwtBtn.addEventListener('click', copyJWT);
    typeFilter.addEventListener('change', onFilterChange);
    refreshSamplesBtn.addEventListener('click', () => loadSamples());
    prevPageBtn.addEventListener('click', () => changePage(currentPage - 1));
    nextPageBtn.addEventListener('click', () => changePage(currentPage + 1));
    
    samplesTable.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => sortTable(th.dataset.sort));
    });
}

function showError(message) {
    errorMessage.textContent = message;
    errorBanner.classList.remove('hidden');
}

function hideError() {
    errorBanner.classList.add('hidden');
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
            
            throw new Error(errorData.error || `HTTP ${response.status}`);
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
        showError('Failed to check authentication status: ' + error.message);
    }
}

// JWT generation
async function generateJWT() {
    try {
        generateJwtBtn.disabled = true;
        generateJwtBtn.textContent = 'Generating...';
        
        const data = await apiCall('/auth/newtoken');
        jwtToken.value = data.personalJWT;
        jwtDisplay.classList.remove('hidden');
        
        showSuccess('JWT token generated successfully!');
    } catch (error) {
        showError('Failed to generate JWT: ' + error.message);
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
        showError('Failed to refresh Fitbit tokens: ' + error.message);
        refreshFitbitBtn.disabled = false;
        refreshFitbitBtn.textContent = 'Refresh Fitbit Tokens';
    }
}

async function manualSync() {
    try {
        manualSyncBtn.disabled = true;
        manualSyncBtn.textContent = 'Syncing...';
        
        const data = await apiCall('/api/sync/trigger', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        showSuccess(`Manual sync completed! ${data.results ? Object.keys(data.results).length : 0} data types synced.`);
        
        // Refresh the samples table to show new data
        await loadSamples();
        
    } catch (error) {
        // Show detailed error information
        let errorMsg = 'Failed to perform manual sync: ' + error.message;
        
        // Check if we have additional error details from the response
        if (error.response) {
            console.error('HTTP Error Response:', error.response);
        }
        
        showError(errorMsg);
    } finally {
        manualSyncBtn.disabled = false;
        manualSyncBtn.textContent = 'Manual Sync';
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
        showError('Failed to load samples: ' + error.message);
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
        samplesTbody.innerHTML = '<tr><td colspan="3">No samples found</td></tr>';
        return;
    }
    
    samplesTbody.innerHTML = samples.map(sample => {
        const timestamp = sample.timestamp || sample.startTime || 'N/A';
        const formattedTimestamp = timestamp !== 'N/A' ? 
            new Date(timestamp).toLocaleString() : 'N/A';
        
        return `
            <tr>
                <td>${escapeHtml(sample.type)}</td>
                <td>${sample.value}</td>
                <td>${formattedTimestamp}</td>
            </tr>
        `;
    }).join('');
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

// Handle browser back/forward
window.addEventListener('popstate', () => {
    loadSamples();
});
