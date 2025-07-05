/**
 * Database class for SQLite operations and schema management.
 * @module backend/services/database
 * @deprecated Use DataService from ../data/data-service.js instead
 */
import { DataService } from '../data/index.js';

/**
 * SQLite database wrapper for Fitbit Sync.
 * This class now serves as a facade over the new repository pattern.
 * @deprecated Use DataService directly for new code
 */
class Database {
  constructor() {
    this.data_service = new DataService();
  }

  async initialize() {
    await this.data_service.initialize();
  }

  async createTables() {
    // Tables are now created in DatabaseConnection.initialize()
    // This method exists for backward compatibility
    return Promise.resolve();
  }

  async storeTokens(accessToken, refreshToken, expiresIn) {
    return await this.data_service.token_repository.store_tokens(accessToken, refreshToken, expiresIn);
  }

  async getTokens() {
    return await this.data_service.token_repository.get_tokens();
  }

  async storeSamples(samples) {
    return await this.data_service.sample_repository.store_samples(samples);
  }

  async getSamplesSince(lastSyncTimestamp) {
    const samples = await this.data_service.sample_repository.get_samples_since(lastSyncTimestamp);
    
    // Convert to match original API format (camelCase)
    return samples.map(sample => {
      const converted = { type: sample.type, value: sample.value };
      if (sample.timestamp) converted.timestamp = sample.timestamp;
      if (sample.start_time) converted.startTime = sample.start_time;
      if (sample.end_time) converted.endTime = sample.end_time;
      return converted;
    });
  }

  async updateSyncLog(dataType, lastSyncTime, status, rateLimitInfo = {}, errorMessage = null) {
    return await this.data_service.sync_log_repository.update_sync_log(
      dataType, 
      lastSyncTime, 
      status, 
      {
        remaining: rateLimitInfo.remaining,
        reset_in: rateLimitInfo.resetIn,
        reset_time: rateLimitInfo.resetTime
      }, 
      errorMessage
    );
  }

  async getLatestSyncTime(dataType) {
    return await this.data_service.sync_log_repository.get_latest_sync_time(dataType);
  }

  async getRateLimitStatus() {
    return await this.data_service.sync_log_repository.get_rate_limit_status();
  }

  async getSamplesPaginated(page = 1, limit = 100, typeFilter = null, sortColumn = 'created_at', sortDirection = 'desc') {
    const result = await this.data_service.sample_repository.get_samples_paginated(
      page, 
      limit, 
      typeFilter, 
      sortColumn, 
      sortDirection
    );

    // Convert to original API format (camelCase)
    const converted_samples = result.samples.map(sample => {
      const converted = { 
        id: sample.id,
        type: sample.type, 
        value: sample.value,
        created_at: sample.created_at
      };
      if (sample.timestamp) converted.timestamp = sample.timestamp;
      if (sample.start_time) converted.startTime = sample.start_time;
      if (sample.end_time) converted.endTime = sample.end_time;
      return converted;
    });

    return {
      samples: converted_samples,
      pagination: {
        currentPage: result.pagination.current_page,
        totalPages: result.pagination.total_pages,
        totalCount: result.pagination.total_count,
        limit: result.pagination.limit,
        hasNext: result.pagination.has_next,
        hasPrev: result.pagination.has_prev
      }
    };
  }

  async getSampleTypes() {
    return await this.data_service.sample_repository.get_sample_types();
  }

  async deleteSamples(samples) {
    return await this.data_service.sample_repository.delete_samples(samples);
  }

  async deleteSamplesByIds(sampleIds) {
    return await this.data_service.sample_repository.delete_samples_by_ids(sampleIds);
  }

  async deleteSamplesByType(sampleType) {
    return await this.data_service.sample_repository.delete_samples_by_type(sampleType);
  }

  async deleteAllSamples() {
    return await this.data_service.sample_repository.delete_all_samples();
  }

  async deleteSamplesByDate(dateStr, sampleTypes = null) {
    return await this.data_service.sample_repository.delete_samples_by_date(dateStr, sampleTypes);
  }

  async getSampleCountByDate(dateStr, sampleTypes = null) {
    const result = await this.data_service.sample_repository.get_sample_count_by_date(dateStr, sampleTypes);
    
    // Convert to original API format (camelCase)
    return {
      totalCount: result.total_count,
      byType: result.by_type,
      date: result.date,
      types: result.types
    };
  }

  async cleanupOldSamples(daysToKeep = 30) {
    return await this.data_service.sample_repository.cleanup_old_samples(daysToKeep);
  }

  close() {
    this.data_service.close();
  }
}

export default Database;
