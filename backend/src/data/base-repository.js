/**
 * Base repository with common database operations.
 * @module backend/data/base-repository
 */
class BaseRepository {
  /**
   * @param {import('./database-connection.js').default} database_connection - The database connection instance.
   */
  constructor(database_connection) {
    /** @private */
    this.db = database_connection.get_connection();
  }

  /**
   * Checks if the database connection is initialized.
   * @private
   * @throws {Error} If the connection is not initialized.
   */
  _check_connection() {
    if (!this.db) {
      throw new Error('Database connection not initialized. Make sure to call DataService.initialize() first.');
    }
  }

  /**
   * Executes a query that modifies data (INSERT, UPDATE, DELETE).
   * @param {string} query - SQL query string.
   * @param {Array} [params=[]] - Query parameters.
   * @returns {Promise<{last_id: number, changes: number}>}
   */
  async execute_query(query, params = []) {
    this._check_connection();
    return new Promise((resolve, reject) => {
      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ last_id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Fetches a single row from the database.
   * @param {string} query - SQL query string.
   * @param {Array} [params=[]] - Query parameters.
   * @returns {Promise<Object|null>} The row or null if not found.
   */
  async fetch_one(query, params = []) {
    this._check_connection();
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Fetches multiple rows from the database.
   * @param {string} query - SQL query string.
   * @param {Array} [params=[]] - Query parameters.
   * @returns {Promise<Array>} Array of rows.
   */
  async fetch_all(query, params = []) {
    this._check_connection();
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}

export default BaseRepository;
