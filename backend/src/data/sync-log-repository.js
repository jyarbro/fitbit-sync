/**
 * Repository for managing synchronization logs.
 * @module backend/data/sync-log-repository
 */
import BaseRepository from './base-repository.js';

/**
 * Repository for managing synchronization logs.
 */
class SyncLogRepository extends BaseRepository {
  /**
   * Updates the sync log with a new entry.
   * @param {string} data_type - The type of data being synced.
   * @param {string} last_sync_time - ISO timestamp of the sync.
   * @param {string} status - Sync status (e.g., 'success', 'error').
   * @param {Object} [rate_limit_info={}] - Rate limit info object.
   * @param {string|null} [error_message=null] - Error message if any.
   * @returns {Promise<number>} The last inserted row ID.
   */
  async update_sync_log(data_type, last_sync_time, status, rate_limit_info = {}, error_message = null) {
    let reset_timestamp = null;
    if (rate_limit_info.reset_in) {
      reset_timestamp = Date.now() + (rate_limit_info.reset_in * 1000);
    } else if (rate_limit_info.reset_time) {
      reset_timestamp = rate_limit_info.reset_time;
    }
    
    const result = await this.execute_query(
      `INSERT INTO sync_log (data_type, last_sync_time, status, rate_limit_remaining, rate_limit_reset, error_message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data_type, 
        last_sync_time, 
        status, 
        rate_limit_info.remaining || null,
        reset_timestamp,
        error_message
      ]
    );
    
    return result.last_id;
  }

  /**
   * Gets the latest successful sync time for a given data type.
   * @param {string} data_type - The data type.
   * @returns {Promise<string|null>} ISO timestamp or null if not found.
   */
  async get_latest_sync_time(data_type) {
    const row = await this.fetch_one(
      'SELECT last_sync_time FROM sync_log WHERE data_type = ? AND status = "success" ORDER BY created_at DESC LIMIT 1',
      [data_type]
    );
    
    return row ? row.last_sync_time : null;
  }

  /**
   * Gets the most recent rate limit status from the sync log.
   * @returns {Promise<{rate_limit_remaining: number, rate_limit_reset: number}>}
   */
  async get_rate_limit_status() {
    const row = await this.fetch_one(
      'SELECT rate_limit_remaining, rate_limit_reset, created_at FROM sync_log WHERE rate_limit_remaining IS NOT NULL ORDER BY created_at DESC LIMIT 1'
    );
    
    if (!row) {
      console.log(`No rate limit data in database, using defaults: 150 remaining`);
      return { rate_limit_remaining: 150, rate_limit_reset: 0 };
    }
    
    const now = Date.now();
    const reset_timestamp = row.rate_limit_reset;
    
    if (reset_timestamp && now >= reset_timestamp) {
      console.log(`Rate limit has reset since last record (${new Date(reset_timestamp).toLocaleString()}), using fresh 150 remaining`);
      return { rate_limit_remaining: 150, rate_limit_reset: 0 };
    }
    
    return {
      rate_limit_remaining: row.rate_limit_remaining,
      rate_limit_reset: reset_timestamp ? Math.max(0, Math.floor((reset_timestamp - now) / 1000)) : 0
    };
  }
}

export default SyncLogRepository;
