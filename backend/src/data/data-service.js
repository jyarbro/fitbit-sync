/**
 * Main data service providing access to all repositories.
 * @module backend/data/data-service
 */
import DatabaseConnection from './database-connection.js';
import TokenRepository from './token-repository.js';
import SampleRepository from './sample-repository.js';
import SyncLogRepository from './sync-log-repository.js';

/**
 * Provides a single entry point for all data repositories.
 */
class DataService {
  constructor() {
    /** @type {DatabaseConnection} */
    this.database_connection = new DatabaseConnection();
    /** @type {TokenRepository|null} */
    this.token_repository = null;
    /** @type {SampleRepository|null} */
    this.sample_repository = null;
    /** @type {SyncLogRepository|null} */
    this.sync_log_repository = null;
  }

  /**
   * Initializes the database connection and all repositories.
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.database_connection.initialize();
    this.token_repository = new TokenRepository(this.database_connection);
    this.sample_repository = new SampleRepository(this.database_connection);
    this.sync_log_repository = new SyncLogRepository(this.database_connection);
  }

  /**
   * Closes the database connection.
   * @returns {void}
   */
  close() {
    this.database_connection.close();
  }
}

export default DataService;
