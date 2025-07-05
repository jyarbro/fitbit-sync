/**
 * Main data service that orchestrates all repositories.
 * @module backend/data/data-service
 */
import DatabaseConnection from './database-connection.js';
import TokenRepository from './token-repository.js';
import SampleRepository from './sample-repository.js';
import SyncLogRepository from './sync-log-repository.js';

/**
 * Main data service providing access to all repositories.
 */
class DataService {
  constructor() {
    this.database_connection = new DatabaseConnection();
    this.token_repository = null;
    this.sample_repository = null;
    this.sync_log_repository = null;
  }

  async initialize() {
    await this.database_connection.initialize();
    
    // Initialize repositories after database connection is established
    this.token_repository = new TokenRepository(this.database_connection);
    this.sample_repository = new SampleRepository(this.database_connection);
    this.sync_log_repository = new SyncLogRepository(this.database_connection);
  }

  close() {
    this.database_connection.close();
  }
}

export default DataService;
