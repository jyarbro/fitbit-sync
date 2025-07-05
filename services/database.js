import sqlite3 from 'sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

sqlite3.verbose();

class Database {
  constructor() {
    this.db = null;
    this.dbPath = join(__dirname, 'fitbit_sync.db');
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const createTablesSQL = `
      -- Store OAuth tokens
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Store processed samples ready for iOS
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

      -- Store sync metadata and rate limit info
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

      -- Index for efficient querying
      CREATE INDEX IF NOT EXISTS idx_samples_timestamp ON samples(timestamp);
      CREATE INDEX IF NOT EXISTS idx_samples_start_time ON samples(start_time);
      CREATE INDEX IF NOT EXISTS idx_samples_type ON samples(type);
      CREATE INDEX IF NOT EXISTS idx_sync_log_data_type ON sync_log(data_type);
    `;

    return new Promise((resolve, reject) => {
      this.db.exec(createTablesSQL, (err) => {
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

  async storeTokens(accessToken, refreshToken, expiresIn) {
    const expiresAt = Date.now() + (expiresIn * 1000);
    
    return new Promise((resolve, reject) => {
      // Delete existing tokens first
      this.db.run('DELETE FROM tokens', (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Insert new tokens
        this.db.run(
          'INSERT INTO tokens (access_token, refresh_token, expires_at) VALUES (?, ?, ?)',
          [accessToken, refreshToken, expiresAt],
          function(err) {
            if (err) {
              reject(err);
            } else {
              console.log('Tokens stored successfully');
              resolve(this.lastID);
            }
          }
        );
      });
    });
  }

  async getTokens() {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM tokens ORDER BY created_at DESC LIMIT 1',
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  async storeSamples(samples) {
    if (!samples || samples.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO samples (type, value, timestamp, start_time, end_time)
      VALUES (?, ?, ?, ?, ?)
    `);

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        let insertCount = 0;
        for (const sample of samples) {
          stmt.run([
            sample.type,
            sample.value,
            sample.timestamp || sample.datetime || null,
            sample.startTime || sample.start_time || null,
            sample.endTime || sample.end_time || null
          ], function(err) {
            if (err) {
              console.error('Error inserting sample:', err);
            } else if (this.changes > 0) {
              insertCount++;
            }
          });
        }
        
        this.db.run('COMMIT', (err) => {
          if (err) {
            this.db.run('ROLLBACK');
            reject(err);
          } else {
            console.log(`Stored ${insertCount} new samples`);
            resolve(insertCount);
          }
        });
      });
      
      stmt.finalize();
    });
  }

  async getSamplesSince(lastSyncTimestamp) {
    const query = `
      SELECT type, value, timestamp, start_time as startTime, end_time as endTime
      FROM samples 
      WHERE 
        (timestamp > ? AND timestamp IS NOT NULL) OR 
        (start_time > ? AND start_time IS NOT NULL)
      ORDER BY 
        COALESCE(timestamp, start_time) ASC
    `;

    return new Promise((resolve, reject) => {
      this.db.all(query, [lastSyncTimestamp, lastSyncTimestamp], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Clean up null values for iOS
          const cleanedRows = rows.map(row => {
            const cleaned = { type: row.type, value: row.value };
            if (row.timestamp) cleaned.timestamp = row.timestamp;
            if (row.startTime) cleaned.startTime = row.startTime;
            if (row.endTime) cleaned.endTime = row.endTime;
            return cleaned;
          });
          resolve(cleanedRows);
        }
      });
    });
  }

  async updateSyncLog(dataType, lastSyncTime, status, rateLimitInfo = {}, errorMessage = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO sync_log (data_type, last_sync_time, status, rate_limit_remaining, rate_limit_reset, error_message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          dataType, 
          lastSyncTime, 
          status, 
          rateLimitInfo.remaining || null,
          rateLimitInfo.resetIn || null,
          errorMessage
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async getLatestSyncTime(dataType) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT last_sync_time FROM sync_log WHERE data_type = ? AND status = "success" ORDER BY created_at DESC LIMIT 1',
        [dataType],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row ? row.last_sync_time : null);
          }
        }
      );
    });
  }

  async getRateLimitStatus() {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT rate_limit_remaining, rate_limit_reset FROM sync_log WHERE rate_limit_remaining IS NOT NULL ORDER BY created_at DESC LIMIT 1',
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || { rate_limit_remaining: 150, rate_limit_reset: 0 });
          }
        }
      );
    });
  }

  async getSamplesPaginated(page = 1, limit = 100, typeFilter = null, sortColumn = 'created_at', sortDirection = 'desc') {
    const offset = (page - 1) * limit;
    const validSortColumns = ['type', 'value', 'timestamp', 'start_time', 'end_time', 'created_at'];
    const validDirections = ['asc', 'desc'];
    
    // Validate sort parameters
    if (!validSortColumns.includes(sortColumn)) {
      sortColumn = 'created_at';
    }
    if (!validDirections.includes(sortDirection.toLowerCase())) {
      sortDirection = 'desc';
    }

    let whereClause = '';
    let params = [];
    
    if (typeFilter) {
      whereClause = 'WHERE type = ?';
      params.push(typeFilter);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM samples ${whereClause}`;
    const totalCount = await new Promise((resolve, reject) => {
      this.db.get(countQuery, params, (err, row) => {
        if (err) reject(err);
        else resolve(row.total);
      });
    });

    // Get samples with pagination
    const dataQuery = `
      SELECT type, value, timestamp, start_time as startTime, end_time as endTime, created_at
      FROM samples 
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection.toUpperCase()}
      LIMIT ? OFFSET ?
    `;
    
    const dataParams = [...params, limit, offset];
    
    const samples = await new Promise((resolve, reject) => {
      this.db.all(dataQuery, dataParams, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Clean up null values for frontend
          const cleanedRows = rows.map(row => {
            const cleaned = { 
              type: row.type, 
              value: row.value,
              created_at: row.created_at
            };
            if (row.timestamp) cleaned.timestamp = row.timestamp;
            if (row.startTime) cleaned.startTime = row.startTime;
            if (row.endTime) cleaned.endTime = row.endTime;
            return cleaned;
          });
          resolve(cleanedRows);
        }
      });
    });

    const totalPages = Math.ceil(totalCount / limit);

    return {
      samples,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  async getSampleTypes() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT DISTINCT type FROM samples ORDER BY type',
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(row => row.type));
          }
        }
      );
    });
  }

  async cleanupOldSamples(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffISO = cutoffDate.toISOString();

    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM samples WHERE created_at < ?',
        [cutoffISO],
        function(err) {
          if (err) {
            reject(err);
          } else {
            if (this.changes > 0) {
              console.log(`Cleaned up ${this.changes} old samples`);
            }
            resolve(this.changes);
          }
        }
      );
    });
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

export default Database;
