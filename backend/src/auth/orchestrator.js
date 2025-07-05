/**
 * Main authentication module that combines all authentication providers.
 * @module backend/Auth/index
 */
import express from 'express';
import AuthFrontend from './frontend.js';
import AuthMicrosoft from './microsoft.js';
import AuthFitbit from './fitbit.js';

/**
 * Orchestrates all authentication providers (frontend, Microsoft, Fitbit).
 */
class AuthOrchestrator {
  /**
   * Create an AuthOrchestrator instance.
   */
  constructor() {
    this.frontend = new AuthFrontend();
    this.microsoft = new AuthMicrosoft();
    this.fitbit = new AuthFitbit();
  }

  /**
   * Create combined authentication routes for all providers.
   * @param {object} params - Dependencies for specific auth providers.
   * @param {object} params.fitbitService - Fitbit API service.
   * @param {object} params.db - Database service (legacy, may be unused).
   * @returns {express.Router} Combined authentication router.
   */
  createRoutes({ fitbitService, db }) {
    const router = express.Router();

    // Mount frontend authentication routes
    const frontendRoutes = this.frontend.createRoutes();
    router.use('/', frontendRoutes);

    // Mount Microsoft authentication routes
    const microsoftRoutes = this.microsoft.createRoutes();
    router.use('/', microsoftRoutes);

    // Mount Fitbit authentication routes
    const fitbitRoutes = this.fitbit.createRoutes({ fitbitService, db });
    router.use('/', fitbitRoutes);

    return router;
  }

  /**
   * Get frontend auth service for JWT verification middleware.
   * @returns {AuthFrontend} Frontend authentication service.
   */
  getFrontendService() {
    return this.frontend;
  }

  /**
   * Get Microsoft auth service.
   * @returns {AuthMicrosoft} Microsoft authentication service.
   */
  getMicrosoftService() {
    return this.microsoft;
  }

  /**
   * Get Fitbit auth service.
   * @returns {AuthFitbit} Fitbit authentication service.
   */
  getFitbitService() {
    return this.fitbit;
  }
}

export default AuthOrchestrator;
