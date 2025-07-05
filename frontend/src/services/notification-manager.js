/**
 * Handles notifications and error banners in the UI.
 * @module frontend/services/notification-manager
 */
import { Utils } from '../utils.js';

/**
 * Notification manager for handling success and error notifications.
 */
export class NotificationManager {
    constructor() {
        this.setupErrorBanner();
    }

    setupErrorBanner() {
        const closeErrorBtn = Utils.getElement('close-error');
        if (closeErrorBtn) {
            closeErrorBtn.addEventListener('click', () => this.hideError());
        }
    }

    showError(message, rateLimitInfo = null) {
        const errorBanner = Utils.getElement('error-banner');
        const errorMessage = Utils.getElement('error-message');
        
        if (!errorBanner || !errorMessage) return;

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

    hideError() {
        const errorBanner = Utils.getElement('error-banner');
        if (errorBanner) {
            errorBanner.classList.add('hidden');
            errorBanner.classList.remove('rate-limit-error');
        }
    }

    showNotification(message, type = 'success', duration = 3000) {
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

    showSuccess(message) {
        this.showNotification(message, 'success', 3000);
    }

    showErrorNotification(message) {
        this.showNotification(message, 'error', 0);
    }
}
