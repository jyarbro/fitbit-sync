/**
 * Database connection class for SQLite operations.
 * @module backend/data/database-connection
 */
import sqlite3 from 'sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
sqlite3.verbose();

/**
 * SQLite database connection wrapper for Fitbit Sync.
 */
class DatabaseConnection {
  constructor() {
    this.db = null;
    this.db_path = join(__dirname, '../services/fitbit_sync.db');
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.db_path, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.create_tables().then(resolve).catch(reject);
        }
      });
    });
  }

  async create_tables() {
    const create_tables_sql = `
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        value REAL NOT NULL,
        timestamp TEXT,
        start_time TEXT,
        end_time TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(type, timestamp, start_time, end_time)
      );

      CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_type TEXT NOT NULL,
        last_sync_time TEXT NOT NULL,
        status TEXT NOT NULL,
        rate_limit_remaining INTEGER,
        rate_limit_reset INTEGER,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_samples_timestamp ON samples(timestamp);
      CREATE INDEX IF NOT EXISTS idx_samples_start_time ON samples(start_time);
      CREATE INDEX IF NOT EXISTS idx_samples_type ON samples(type);
      CREATE INDEX IF NOT EXISTS idx_sync_log_data_type ON sync_log(data_type);
    `;

    return new Promise((resolve, reject) => {
      this.db.exec(create_tables_sql, (err) => {
        if (err) {
          console.error('Error creating tables:', err);
          reject(err);
        } else {
          console.log('Database tables created successfully');
          resolve();
        }
      });
    });
  }

  get_connection() {
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('Database connection closed');
        }
      });
    }
  }
}

export default DatabaseConnection;
