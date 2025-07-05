/**
 * Utility functions for frontend UI and DOM operations.
 * @module frontend/utils
 */
export class Utils {
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static formatDateForInput(date) {
        return date.toISOString().split('T')[0];
    }

    static getElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Element with ID '${id}' not found`);
        }
        return element;
    }

    static setElementText(id, text) {
        const element = this.getElement(id);
        if (element) {
            element.textContent = text;
        }
    }

    static setElementHtml(id, html) {
        const element = this.getElement(id);
        if (element) {
            element.innerHTML = html;
        }
    }

    static toggleElement(id, show) {
        const element = this.getElement(id);
        if (element) {
            element.classList.toggle('hidden', !show);
        }
    }

    static initializeDateInputs() {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const singleDateInput = this.getElement('single-date');
        if (singleDateInput) {
            singleDateInput.value = this.formatDateForInput(yesterday);
            singleDateInput.max = this.formatDateForInput(today);
        }

        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const startDateInput = this.getElement('start-date');
        if (startDateInput) {
            startDateInput.value = this.formatDateForInput(weekAgo);
            startDateInput.max = this.formatDateForInput(today);
        }

        const endDateInput = this.getElement('end-date');
        if (endDateInput) {
            endDateInput.value = this.formatDateForInput(yesterday);
            endDateInput.max = this.formatDateForInput(today);
        }
    }

    static validateDateRange(startDate, endDate, maxDays = 30) {
        if (!startDate || !endDate) {
            return { valid: false, error: 'Please select both start and end dates' };
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (start > end) {
            return { valid: false, error: 'Start date must be before or equal to end date' };
        }

        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        if (daysDiff > maxDays) {
            return { valid: false, error: `Date range too large. Maximum ${maxDays} days allowed.` };
        }

        return { valid: true, daysDiff };
    }

    static debounce(func, wait) {
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
}
