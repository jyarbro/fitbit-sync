/**
 * Base repository class providing common database operations.
 * @module backend/data/base-repository
 */

/**
 * Base repository with common database operations.
 */
class BaseRepository {
  constructor(database_connection) {
    this.db = database_connection.get_connection();
  }

  _check_connection() {
    if (!this.db) {
      throw new Error('Database connection not initialized. Make sure to call DataService.initialize() first.');
    }
  }

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
