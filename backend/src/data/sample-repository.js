/**
 * Sample repository for health data sample operations.
 * @module backend/data/sample-repository
 */
import BaseRepository from './base-repository.js';

/**
 * Repository for managing health data samples.
 */
class SampleRepository extends BaseRepository {
  async store_samples(samples) {
    if (!samples || samples.length === 0) return 0;

    this._check_connection();

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO samples (type, value, timestamp, start_time, end_time)
      VALUES (?, ?, ?, ?, ?)
    `);

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        let insert_count = 0;
        for (const sample of samples) {
          stmt.run([
            sample.type,
            sample.value,
            sample.timestamp || sample.datetime || null,
            sample.start_time || sample.startTime || null,
            sample.end_time || sample.endTime || null
          ], function(err) {
            if (err) {
              console.error('Error inserting sample:', err);
            } else if (this.changes > 0) {
              insert_count++;
            }
          });
        }
        
        this.db.run('COMMIT', (err) => {
          if (err) {
            this.db.run('ROLLBACK');
            reject(err);
          } else {
            console.log(`Stored ${insert_count} new samples`);
            resolve(insert_count);
          }
        });
      });
      
      stmt.finalize();
    });
  }

  async get_samples_since(last_sync_timestamp) {
    const query = `
      SELECT type, value, timestamp, start_time, end_time
      FROM samples 
      WHERE 
        (timestamp > ? AND timestamp IS NOT NULL) OR 
        (start_time > ? AND start_time IS NOT NULL)
      ORDER BY 
        COALESCE(timestamp, start_time) ASC
    `;

    const rows = await this.fetch_all(query, [last_sync_timestamp, last_sync_timestamp]);
    
    return rows.map(row => {
      const cleaned = { type: row.type, value: row.value };
      if (row.timestamp) cleaned.timestamp = row.timestamp;
      if (row.start_time) cleaned.start_time = row.start_time;
      if (row.end_time) cleaned.end_time = row.end_time;
      return cleaned;
    });
  }

  async get_samples_paginated(page = 1, limit = 100, type_filter = null, sort_column = 'created_at', sort_direction = 'desc') {
    const offset = (page - 1) * limit;
    const valid_sort_columns = ['type', 'value', 'timestamp', 'start_time', 'end_time', 'created_at'];
    const valid_directions = ['asc', 'desc'];
    
    if (!valid_sort_columns.includes(sort_column)) {
      sort_column = 'created_at';
    }
    if (!valid_directions.includes(sort_direction.toLowerCase())) {
      sort_direction = 'desc';
    }

    let where_clause = '';
    let params = [];
    
    if (type_filter) {
      where_clause = 'WHERE type = ?';
      params.push(type_filter);
    }

    const count_query = `SELECT COUNT(*) as total FROM samples ${where_clause}`;
    const total_result = await this.fetch_one(count_query, params);
    const total_count = total_result.total;

    const data_query = `
      SELECT id, type, value, timestamp, start_time, end_time, created_at
      FROM samples 
      ${where_clause}
      ORDER BY ${sort_column} ${sort_direction.toUpperCase()}
      LIMIT ? OFFSET ?
    `;
    
    const data_params = [...params, limit, offset];
    const samples = await this.fetch_all(data_query, data_params);

    const cleaned_samples = samples.map(row => {
      const cleaned = { 
        id: row.id,
        type: row.type, 
        value: row.value,
        created_at: row.created_at
      };
      if (row.timestamp) cleaned.timestamp = row.timestamp;
      if (row.start_time) cleaned.start_time = row.start_time;
      if (row.end_time) cleaned.end_time = row.end_time;
      return cleaned;
    });

    const total_pages = Math.ceil(total_count / limit);

    return {
      samples: cleaned_samples,
      pagination: {
        current_page: page,
        total_pages,
        total_count,
        limit,
        has_next: page < total_pages,
        has_prev: page > 1
      }
    };
  }

  async get_sample_types() {
    const rows = await this.fetch_all('SELECT DISTINCT type FROM samples ORDER BY type');
    return rows.map(row => row.type);
  }

  async delete_samples(samples) {
    if (!samples || samples.length === 0) {
      return 0;
    }

    const conditions = samples.map(sample => {
      const conditions = ['type = ?'];
      const params = [sample.type];
      
      if (sample.value !== undefined && sample.value !== null) {
        conditions.push('value = ?');
        params.push(sample.value);
      }
      
      if (sample.timestamp) {
        conditions.push('timestamp = ?');
        params.push(sample.timestamp);
      } else if (sample.start_time || sample.startTime) {
        conditions.push('start_time = ?');
        params.push(sample.start_time || sample.startTime);
      }
      
      if (sample.end_time || sample.endTime) {
        conditions.push('end_time = ?');
        params.push(sample.end_time || sample.endTime);
      }
      
      return { condition: `(${conditions.join(' AND ')})`, params };
    });

    const where_clause = conditions.map(c => c.condition).join(' OR ');
    const all_params = conditions.flatMap(c => c.params);
    
    const result = await this.execute_query(`DELETE FROM samples WHERE ${where_clause}`, all_params);
    console.log(`Deleted ${result.changes} samples`);
    return result.changes;
  }

  async delete_samples_by_ids(sample_ids) {
    if (!sample_ids || sample_ids.length === 0) {
      return 0;
    }

    const placeholders = sample_ids.map(() => '?').join(',');
    const result = await this.execute_query(`DELETE FROM samples WHERE id IN (${placeholders})`, sample_ids);
    
    console.log(`Deleted ${result.changes} samples by ID`);
    return result.changes;
  }

  async delete_samples_by_type(sample_type) {
    const result = await this.execute_query('DELETE FROM samples WHERE type = ?', [sample_type]);
    console.log(`Deleted ${result.changes} samples of type ${sample_type}`);
    return result.changes;
  }

  async delete_all_samples() {
    const result = await this.execute_query('DELETE FROM samples');
    console.log(`Deleted all ${result.changes} samples`);
    return result.changes;
  }

  async delete_samples_by_date(date_str, sample_types = null) {
    if (!date_str) {
      throw new Error('Date is required for deletion');
    }

    const date_regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!date_regex.test(date_str)) {
      throw new Error('Date must be in YYYY-MM-DD format');
    }

    const start_of_day = `${date_str}T00:00:00.000Z`;
    const end_of_day = `${date_str}T23:59:59.999Z`;

    let where_conditions = [];
    let params = [];

    where_conditions.push(`(
      (timestamp >= ? AND timestamp <= ?) OR 
      (start_time >= ? AND start_time <= ?) OR
      (end_time >= ? AND end_time <= ?) OR
      (DATE(timestamp) = ?) OR
      (DATE(start_time) = ?) OR
      (DATE(end_time) = ?)
    )`);
    
    params.push(start_of_day, end_of_day, start_of_day, end_of_day, start_of_day, end_of_day, date_str, date_str, date_str);

    if (sample_types && Array.isArray(sample_types) && sample_types.length > 0) {
      const type_placeholders = sample_types.map(() => '?').join(',');
      where_conditions.push(`type IN (${type_placeholders})`);
      params.push(...sample_types);
    }

    const where_clause = where_conditions.join(' AND ');
    const result = await this.execute_query(`DELETE FROM samples WHERE ${where_clause}`, params);
    
    const message = sample_types 
      ? `Deleted ${result.changes} samples for date ${date_str} (types: ${sample_types.join(', ')})`
      : `Deleted ${result.changes} samples for date ${date_str} (all types)`;
    console.log(message);
    
    return {
      deleted_count: result.changes,
      date: date_str,
      types: sample_types || 'all'
    };
  }

  async get_sample_count_by_date(date_str, sample_types = null) {
    if (!date_str) {
      throw new Error('Date is required');
    }

    const start_of_day = `${date_str}T00:00:00.000Z`;
    const end_of_day = `${date_str}T23:59:59.999Z`;

    let where_conditions = [];
    let params = [];

    where_conditions.push(`(
      (timestamp >= ? AND timestamp <= ?) OR 
      (start_time >= ? AND start_time <= ?) OR
      (end_time >= ? AND end_time <= ?) OR
      (DATE(timestamp) = ?) OR
      (DATE(start_time) = ?) OR
      (DATE(end_time) = ?)
    )`);
    
    params.push(start_of_day, end_of_day, start_of_day, end_of_day, start_of_day, end_of_day, date_str, date_str, date_str);

    if (sample_types && Array.isArray(sample_types) && sample_types.length > 0) {
      const type_placeholders = sample_types.map(() => '?').join(',');
      where_conditions.push(`type IN (${type_placeholders})`);
      params.push(...sample_types);
    }

    const where_clause = where_conditions.join(' AND ');
    const rows = await this.fetch_all(`SELECT COUNT(*) as count, type FROM samples WHERE ${where_clause} GROUP BY type`, params);
    
    const total_count = rows.reduce((sum, row) => sum + row.count, 0);
    return {
      total_count,
      by_type: rows,
      date: date_str,
      types: sample_types || 'all'
    };
  }

  async cleanup_old_samples(days_to_keep = 30) {
    const cutoff_date = new Date();
    cutoff_date.setDate(cutoff_date.getDate() - days_to_keep);
    const cutoff_iso = cutoff_date.toISOString();

    const result = await this.execute_query('DELETE FROM samples WHERE created_at < ?', [cutoff_iso]);
    
    if (result.changes > 0) {
      console.log(`Cleaned up ${result.changes} old samples`);
    }
    return result.changes;
  }
}

export default SampleRepository;
