/**
 * Service for Fitbit API integration and token management.
 * @module backend/services/fitbit-service
 */
import axios from 'axios';

/**
 * Fitbit API integration and token management.
 * Handles OAuth tokens, API requests, and data synchronization for Fitbit user data.
 */
class FitbitService {
  /**
   * Create a FitbitService instance.
   * @param {object} dataService - DataService instance providing repositories.
   */
  constructor(dataService) {
    this.dataService = dataService;
    this.baseURL = 'https://api.fitbit.com';
    this.scopes = this.loadScopes();
  }

  /**
   * Load Fitbit API scopes from environment or use defaults.
   * @returns {string[]} Array of scope names.
   */
  loadScopes() {
    try {
      const scopesEnv = process.env.FITBIT_SCOPES;
      if (scopesEnv) {
        return scopesEnv
          .split(' ')
          .filter(scope => scope.trim())
          .map(scope => scope.trim());
      }
      
      // Fallback to default scopes if environment variable is not set
      console.warn('FITBIT_SCOPES environment variable not set, using default scopes');
      return ['activity', 'heartrate', 'sleep'];
    } catch (error) {
      console.error('Error loading scopes:', error);
      return ['activity', 'heartrate', 'sleep']; // fallback
    }
  }

  /**
   * Ensure a valid access token is available, refreshing if needed.
   * @returns {Promise<string>} Access token.
   * @throws {Error} If no tokens are found or refresh fails.
   */
  async ensureValidToken() {
    const tokens = await this.dataService.token_repository.get_tokens();
    
    if (!tokens) {
      throw new Error('No tokens found. Please complete OAuth flow first.');
    }

    // Refresh if expires within 1 hour (3600 seconds)
    if ((tokens.expires_at - Date.now()) < 3600000) {
      console.log('Token expires soon, refreshing...');
      return await this.refreshToken();
    }
    
    return tokens.access_token;
  }

  /**
   * Refresh the Fitbit OAuth token using the refresh token.
   * @returns {Promise<string>} New access token.
   * @throws {Error} If refresh token is missing or refresh fails.
   */
  async refreshToken() {
    const tokens = await this.dataService.token_repository.get_tokens();
    
    if (!tokens || !tokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(`${this.baseURL}/oauth2/token`, 
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token
        }), {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      await this.dataService.token_repository.store_tokens(
        response.data.access_token,
        response.data.refresh_token,
        response.data.expires_in
      );
      
      console.log('Token refreshed successfully');
      return response.data.access_token;
    } catch (error) {
      console.error('Token refresh failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get a local date string in YYYY-MM-DD format.
   * @param {Date} [date] - Date object (defaults to now).
   * @returns {string} Local date string.
   */
  getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Extract Fitbit API rate limit information from a response.
   * @param {object} response - Axios response object.
   * @returns {object} Rate limit info.
   */
  extractRateLimitInfo(response) {
    const remaining = parseInt(response.headers['fitbit-rate-limit-remaining']) || 0;
    const resetIn = parseInt(response.headers['fitbit-rate-limit-reset']) || 0;
    const limit = parseInt(response.headers['fitbit-rate-limit-limit']) || 150;
    
    // Calculate the actual reset time (top of next hour)
    const now = new Date();
    const resetTime = new Date(now);
    resetTime.setHours(now.getHours() + 1, 0, 0, 0); // Next hour at :00:00
    
    return {
      remaining,
      resetIn, // Seconds until reset (from Fitbit)
      limit,
      resetTime: resetTime.getTime(), // Actual timestamp when it resets
      used: limit - remaining
    };
  }

  /**
   * Make an authenticated GET request to the Fitbit API.
   * Handles token refresh and rate limit errors.
   * @param {string} endpoint - Fitbit API endpoint (e.g., '/1/user/-/activities/steps/date/...').
   * @param {object} [params] - Query parameters.
   * @returns {Promise<{data: object, rateLimitInfo: object}>} API response data and rate limit info.
   * @throws {Error} On request failure or rate limit exceeded.
   */
  async makeAPIRequest(endpoint, params = {}) {
    const accessToken = await this.ensureValidToken();
    
    try {
      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept-Language': 'en_US' // For US units
        },
        params
      });

      const rateLimitInfo = this.extractRateLimitInfo(response);
      
      // Log detailed rate limit status
      console.log(`API Request to ${endpoint} - Rate Limit Status: ${rateLimitInfo.remaining}/${rateLimitInfo.limit} remaining (${rateLimitInfo.used} used), resets in ${rateLimitInfo.resetIn}s at ${new Date(rateLimitInfo.resetTime).toLocaleString()}`);
      
      if (rateLimitInfo.remaining < 20) {
        console.warn(`WARNING: Rate limit getting low: ${rateLimitInfo.remaining}/${rateLimitInfo.limit} remaining (${rateLimitInfo.used} used), resets in ${rateLimitInfo.resetIn}s at ${new Date(rateLimitInfo.resetTime).toLocaleString()}`);
      }

      return { data: response.data, rateLimitInfo };
    } catch (error) {
      if (error.response?.status === 429) {
        const rateLimitHeaders = {
          remaining: parseInt(error.response.headers['fitbit-rate-limit-remaining']) || 0,
          limit: parseInt(error.response.headers['fitbit-rate-limit-limit']) || 150,
          resetIn: parseInt(error.response.headers['fitbit-rate-limit-reset']) || 0
        };
        
        const used = rateLimitHeaders.limit - rateLimitHeaders.remaining;
        const now = new Date();
        const resetTime = new Date(now);
        resetTime.setHours(now.getHours() + 1, 0, 0, 0);
        
        console.error(`🚫 Rate limit exceeded on ${endpoint}:`);
        console.error(`   Current usage: ${used}/${rateLimitHeaders.limit} requests used`);
        console.error(`   Remaining: ${rateLimitHeaders.remaining} requests`);
        console.error(`   Reset in: ${rateLimitHeaders.resetIn} seconds`);
        console.error(`   Reset at: ${resetTime.toLocaleString()}`);
        
        throw new Error(`Rate limit exceeded. Used ${used}/${rateLimitHeaders.limit} requests. ${rateLimitHeaders.remaining} remaining. Resets in ${rateLimitHeaders.resetIn} seconds (${resetTime.toLocaleString()})`);
      }
      
      if (error.response?.status === 401) {
        console.log('Token expired, attempting refresh...');
        await this.refreshToken();
        // Retry the request once with new token
        return this.makeAPIRequest(endpoint, params);
      }
      
      throw error;
    }
  }

  /**
   * Synchronize activity data (steps, calories) for a given date.
   * @param {string} [dateStr] - Date string (YYYY-MM-DD). Defaults to today.
   * @returns {Promise<number>} Number of samples processed.
   * @throws {Error} On sync failure.
   */
  async syncActivityData(dateStr = null) {
    console.log('Syncing activity data...');
    const samples = [];
    const now = new Date();
    const today = dateStr || this.getLocalDateString(now);
    
    try {
      const stepsResponse = await this.makeAPIRequest(
        `/1/user/-/activities/steps/date/${today}/1d/1min.json`
      );

      const stepsSamples = this.processStepsData(stepsResponse.data['activities-steps-intraday'].dataset, today);
      
      samples.push(...stepsSamples);

      const caloriesResponse = await this.makeAPIRequest(
        `/1/user/-/activities/calories/date/${today}/1d/1min.json`
      );

      const bmrData = caloriesResponse.data['activities-calories'][0];
      const dailyBMR = bmrData ? bmrData.value : 0;
      const bmrPerMinute = dailyBMR / (24 * 60);

      const caloriesSamples = this.processCaloriesData(
        caloriesResponse.data['activities-calories-intraday'].dataset,
        bmrPerMinute,
        today
      );

      samples.push(...caloriesSamples);

      if (samples.length > 0) {
        await this.dataService.sample_repository.store_samples(samples);
      }

      await this.dataService.sync_log_repository.update_sync_log(
        'activity',
        now.toISOString(),
        'success',
        stepsResponse.rateLimitInfo
      );

      console.log(`Activity sync completed: ${samples.length} samples processed`);
      
      return samples.length;
    } catch (error) {
      await this.dataService.sync_log_repository.update_sync_log(
        'activity',
        now.toISOString(),
        'error',
        {},
        error.message
      );

      throw error;
    }
  }

  /**
   * Process intraday steps data into sample blocks.
   * @param {object[]} dataset - Fitbit steps dataset.
   * @param {string} dateStr - Date string (YYYY-MM-DD).
   * @returns {object[]} Array of step sample objects.
   */
  processStepsData(dataset, dateStr) {
    const samples = [];
    let currentBlock = null;
    const maxBlockMinutes = 15;
    const inactiveThresholdMinutes = 10;
    
    for (let i = 0; i < dataset.length; i++) {
      const dataPoint = dataset[i];
      const steps = parseInt(dataPoint.value);
      const timestamp = new Date(`${dateStr}T${dataPoint.time}`);
      
      if (steps > 0) {
        if (!currentBlock) {
          // Start new block
          currentBlock = {
            startTime: timestamp,
            endTime: timestamp,
            totalSteps: steps,
            minutes: 1
          };
        } else {
          // Add to current block
          currentBlock.endTime = timestamp;
          currentBlock.totalSteps += steps;
          currentBlock.minutes++;
          
          // Check if block should be split (max 15 minutes)
          if (currentBlock.minutes >= maxBlockMinutes) {
            samples.push({
              type: 'steps',
              value: currentBlock.totalSteps,
              datetime: currentBlock.endTime.toISOString()
            });
            
            // Start new block
            currentBlock = {
              startTime: timestamp,
              endTime: timestamp,
              totalSteps: steps,
              minutes: 1
            };
          }
        }
      } else {
        // Zero steps - check if we should end current block
        if (currentBlock) {
          // Count consecutive zero minutes
          let zeroCount = 0;

          for (let j = i; j < Math.min(i + inactiveThresholdMinutes, dataset.length); j++) {
            if (parseInt(dataset[j].value) === 0) {
              zeroCount++;
            } else {
              break;
            }
          }
          
          // End block if 10+ minutes of inactivity ahead
          if (zeroCount >= inactiveThresholdMinutes) {
            samples.push({
              type: 'steps',
              value: currentBlock.totalSteps,
              datetime: currentBlock.endTime.toISOString()
            });
            currentBlock = null;
          }
        }
      }
    }
    
    // Don't forget the last block
    if (currentBlock) {
      samples.push({
        type: 'steps',
        value: currentBlock.totalSteps,
        datetime: currentBlock.endTime.toISOString()
      });
    }
    
    return samples;
  }

  /**
   * Process intraday calories data into active calorie samples.
   * @param {object[]} dataset - Fitbit calories dataset.
   * @param {number} bmrPerMinute - Basal metabolic rate per minute.
   * @param {string} dateStr - Date string (YYYY-MM-DD).
   * @returns {object[]} Array of active calorie sample objects.
   */
  processCaloriesData(dataset, bmrPerMinute, dateStr) {
    const samples = [];
    const blockSizes = [30, 15]; // in minutes
    let i = 0;
    while (i < dataset.length) {
      let blockSize = blockSizes[0];
      let block = dataset.slice(i, i + blockSize);
      // Calculate active calories for the block (remove BMR per minute)
      const activeCaloriesArr = block.map(dataPoint => Math.max(0, parseFloat(dataPoint.value) - bmrPerMinute));
      // Calculate total and standard deviation
      const total = activeCaloriesArr.reduce((a, b) => a + b, 0);
      const avg = total / activeCaloriesArr.length;
      const stddev = Math.sqrt(activeCaloriesArr.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / activeCaloriesArr.length);
      // Heuristic: if stddev > 20% of avg and blockSize > 15, split into 15-min blocks
      if (blockSize === 30 && stddev > 0.2 * avg) {
        // Split into two 15-min blocks
        for (let j = 0; j < 2; j++) {
          const subBlock = dataset.slice(i + j * 15, i + (j + 1) * 15);
          const subActiveArr = subBlock.map(dataPoint => Math.max(0, parseFloat(dataPoint.value) - bmrPerMinute));
          const subTotal = subActiveArr.reduce((a, b) => a + b, 0);
          if (subTotal > 0) {
            const subTimestamp = new Date(`${dateStr}T${subBlock[subBlock.length - 1].time}`);
            samples.push({
              type: 'activeCalories',
              value: subTotal,
              datetime: subTimestamp.toISOString()
            });
          }
        }
        i += 30;
      } else {
        // Use the block as is
        if (total > 0) {
          const timestamp = new Date(`${dateStr}T${block[block.length - 1].time}`);
          samples.push({
            type: 'activeCalories',
            value: total,
            datetime: timestamp.toISOString()
          });
        }
        i += blockSize;
      }
    }
    return samples;
  }

  /**
   * Synchronize heart rate data for a given date.
   * @param {string} [dateStr] - Date string (YYYY-MM-DD). Defaults to today.
   * @returns {Promise<number>} Number of samples processed.
   * @throws {Error} On sync failure.
   */
  async syncHeartRateData(dateStr = null) {
    console.log('Syncing heart rate data...');
    const samples = [];
    const now = new Date();
    const today = dateStr || this.getLocalDateString(now);
    
    try {
      const response = await this.makeAPIRequest(
        `/1/user/-/activities/heart/date/${today}/1d/1min.json`
      );
      
      const dataset = response.data['activities-heart-intraday']?.dataset || [];
      
      const heartRateSamples = this.processHeartRateData(dataset, today);
      samples.push(...heartRateSamples);
      
      if (samples.length > 0) {
        await this.dataService.sample_repository.store_samples(samples);
      }

      await this.dataService.sync_log_repository.update_sync_log(
        'heartrate',
        now.toISOString(),
        'success',
        response.rateLimitInfo
      );

      console.log(`Heart rate sync completed: ${samples.length} samples processed`);
      return samples.length;
    } catch (error) {
      await this.dataService.sync_log_repository.update_sync_log(
        'heartrate',
        now.toISOString(),
        'error',
        {},
        error.message
      );
      throw error;
    }
  }

  /**
   * Process intraday heart rate data into sample blocks using exertion detection.
   * @param {object[]} dataset - Fitbit heart rate dataset.
   * @param {string} dateStr - Date string (YYYY-MM-DD).
   * @returns {object[]} Array of heart rate sample objects.
   */
  processHeartRateData(dataset, dateStr) {
    const samples = [];
    let currentBlock = null;
    const normalBlockMinutes = 30; // 30 minutes for stable periods
    const exertionBlockMinutes = 5; // 5 minutes during exertion
    const deviationThreshold = 15; // BPM threshold for detecting exertion
    const minBlockMinutes = 3; // Minimum block size to avoid too small blocks
    
    // First pass: calculate rolling baseline to detect exertion periods
    const rollingWindow = 10; // 10-minute window for baseline calculation
    const baselines = [];
    
    for (let i = 0; i < dataset.length; i++) {
      const dataPoint = dataset[i];
      const heartRate = parseInt(dataPoint.value);
      
      if (heartRate > 0) {
        // Calculate baseline from surrounding data
        const windowStart = Math.max(0, i - rollingWindow);
        const windowEnd = Math.min(dataset.length, i + rollingWindow);
        
        let sum = 0;
        let count = 0;
        
        for (let j = windowStart; j < windowEnd; j++) {
          const hr = parseInt(dataset[j].value);
          if (hr > 0) {
            sum += hr;
            count++;
          }
        }
        
        const baseline = count > 0 ? sum / count : heartRate;
        baselines[i] = { heartRate, baseline, isExertion: Math.abs(heartRate - baseline) > deviationThreshold };
      } else {
        baselines[i] = { heartRate: 0, baseline: 0, isExertion: false };
      }
    }
    
    // Second pass: create blocks based on exertion detection
    for (let i = 0; i < dataset.length; i++) {
      const dataPoint = dataset[i];
      const analysis = baselines[i];
      const timestamp = new Date(`${dateStr}T${dataPoint.time}`);
      
      if (analysis.heartRate > 0) {
        const targetBlockSize = analysis.isExertion ? exertionBlockMinutes : normalBlockMinutes;
        
        if (!currentBlock) {
          // Start new block
          currentBlock = {
            startTime: timestamp,
            endTime: timestamp,
            heartRates: [analysis.heartRate],
            minutes: 1,
            isExertionBlock: analysis.isExertion,
            targetSize: targetBlockSize
          };
        } else {
          // Check if we should continue current block or start new one
          const blockTypeChanged = (currentBlock.isExertionBlock !== analysis.isExertion);
          const blockSizeReached = currentBlock.minutes >= currentBlock.targetSize;
          const minSizeReached = currentBlock.minutes >= minBlockMinutes;
          
          if (blockTypeChanged && minSizeReached) {
            // Block type changed (exertion <-> normal), finish current block
            const averageHR = Math.round(currentBlock.heartRates.reduce((sum, hr) => sum + hr, 0) / currentBlock.heartRates.length);
            samples.push({
              type: 'heartRate',
              value: averageHR,
              datetime: currentBlock.endTime.toISOString()
            });
            
            // Start new block with current type
            currentBlock = {
              startTime: timestamp,
              endTime: timestamp,
              heartRates: [analysis.heartRate],
              minutes: 1,
              isExertionBlock: analysis.isExertion,
              targetSize: targetBlockSize
            };
          } else if (blockSizeReached) {
            // Block size reached, finish current block
            const averageHR = Math.round(currentBlock.heartRates.reduce((sum, hr) => sum + hr, 0) / currentBlock.heartRates.length);
            samples.push({
              type: 'heartRate',
              value: averageHR,
              datetime: currentBlock.endTime.toISOString()
            });
            
            // Start new block
            currentBlock = {
              startTime: timestamp,
              endTime: timestamp,
              heartRates: [analysis.heartRate],
              minutes: 1,
              isExertionBlock: analysis.isExertion,
              targetSize: targetBlockSize
            };
          } else {
            // Continue current block
            currentBlock.endTime = timestamp;
            currentBlock.heartRates.push(analysis.heartRate);
            currentBlock.minutes++;
            
            // Update block type if we're transitioning and haven't reached min size yet
            if (!minSizeReached) {
              currentBlock.isExertionBlock = analysis.isExertion;
              currentBlock.targetSize = targetBlockSize;
            }
          }
        }
      } else {
        // Zero/invalid heart rate - check if we should end current block
        if (currentBlock) {
          // Count consecutive zero readings
          let zeroCount = 0;
          const gapThreshold = 5; // 5 minutes of missing data ends a block
          
          for (let j = i; j < Math.min(i + gapThreshold, dataset.length); j++) {
            if (parseInt(dataset[j].value) === 0) {
              zeroCount++;
            } else {
              break;
            }
          }
          
          // End block if significant gap ahead and minimum size reached
          if (zeroCount >= gapThreshold && currentBlock.minutes >= minBlockMinutes) {
            const averageHR = Math.round(currentBlock.heartRates.reduce((sum, hr) => sum + hr, 0) / currentBlock.heartRates.length);
            samples.push({
              type: 'heartRate',
              value: averageHR,
              datetime: currentBlock.endTime.toISOString()
            });
            currentBlock = null;
          }
        }
      }
    }
    
    // Don't forget the last block
    if (currentBlock && currentBlock.minutes >= minBlockMinutes) {
      const averageHR = Math.round(currentBlock.heartRates.reduce((sum, hr) => sum + hr, 0) / currentBlock.heartRates.length);
      samples.push({
        type: 'heartRate',
        value: averageHR,
        datetime: currentBlock.endTime.toISOString()
      });
    }
    
    return samples;
  }

  /**
   * Synchronize sleep data for a given date (previous night if not specified).
   * @param {string} [dateStr] - Date string (YYYY-MM-DD). Defaults to previous night.
   * @returns {Promise<number>} Number of samples processed.
   * @throws {Error} On sync failure.
   */
  async syncSleepData(dateStr = null) {
    console.log('Syncing sleep data...');
    const samples = [];
    const now = new Date();
    let targetDate;
    
    if (dateStr) {
      targetDate = dateStr;
    } else {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      targetDate = this.getLocalDateString(yesterday);
    }
    
    try {
      const response = await this.makeAPIRequest(
        `/1.2/user/-/sleep/date/${targetDate}.json`
      );
      
      const sleepLogs = response.data.sleep || [];
      
      for (const sleepLog of sleepLogs) {
        if (sleepLog.levels && sleepLog.levels.data) {
          // Process main sleep stages
          for (const stage of sleepLog.levels.data) {
            samples.push({
              type: 'sleepAnalysis',
              value: stage.level, // 'awake', 'light', 'deep', 'rem'
              datetime: new Date(new Date(stage.dateTime).getTime() + (stage.seconds * 1000)).toISOString()
            });
          }
          
          // Process short wake periods (override sleep stages)
          if (sleepLog.levels.shortData) {
            for (const shortWake of sleepLog.levels.shortData) {
              if (shortWake.level === 'wake') {
                samples.push({
                  type: 'sleepAnalysis',
                  value: 'awake',
                  datetime: new Date(new Date(shortWake.dateTime).getTime() + (shortWake.seconds * 1000)).toISOString()
                });
              }
            }
          }
        }
      }
      
      if (samples.length > 0) {
        await this.dataService.sample_repository.store_samples(samples);
      }

      await this.dataService.sync_log_repository.update_sync_log(
        'sleep',
        now.toISOString(),
        'success',
        response.rateLimitInfo
      );

      console.log(`Sleep sync completed: ${samples.length} samples processed`);
      return samples.length;
    } catch (error) {
      await this.dataService.sync_log_repository.update_sync_log(
        'sleep',
        now.toISOString(),
        'error',
        {},
        error.message
      );
      throw error;
    }
  }

  /**
   * Synchronize other health data (SpO2, respiratory rate, temperature) for a given date.
   * @param {string} [dateStr] - Date string (YYYY-MM-DD). Defaults to today.
   * @returns {Promise<number>} Number of samples processed.
   * @throws {Error} On sync failure.
   */
  async syncOtherData(dateStr = null) {
    console.log('Syncing other health data...');
    const samples = [];
    const now = new Date();
    const today = dateStr || this.getLocalDateString(now);
    
    try {
      if (this.scopes.includes('oxygen_saturation')) {
        try {
          const spo2Response = await this.makeAPIRequest(`/1/user/-/spo2/date/${today}.json`);
          const spo2Data = spo2Response.data.value || [];
          
          for (const reading of spo2Data) {
            if (reading.value && reading.value.avg) {
              samples.push({
                type: 'oxygenSaturation',
                value: reading.value.avg,
                datetime: reading.dateTime
              });
            }
          }
        } catch (error) {
          console.log('SpO2 data not available or error:', error.message);
        }
      }

      if (this.scopes.includes('respiratory_rate')) {
        try {
          const brResponse = await this.makeAPIRequest(`/1/user/-/br/date/${today}.json`);
          const brData = brResponse.data.br || [];
          
          for (const reading of brData) {
            if (reading.value && reading.value.breathingRate) {
              samples.push({
                type: 'respiratoryRate',
                value: reading.value.breathingRate,
                datetime: reading.dateTime
              });
            }
          }
        } catch (error) {
          console.log('Respiratory rate data not available or error:', error.message);
        }
      }

      if (this.scopes.includes('temperature')) {
        try {
          const tempResponse = await this.makeAPIRequest(`/1/user/-/temp/skin/date/${today}.json`);
          const tempData = tempResponse.data.tempSkin || [];
          
          for (const reading of tempData) {
            if (reading.value && reading.value.nightlyRelative) {
              // Convert relative temperature to approximate absolute value
              const baselineTemp = 98.6; // Fahrenheit baseline
              const absoluteTemp = baselineTemp + reading.value.nightlyRelative;
              
              samples.push({
                type: 'bodyTemperature',
                value: absoluteTemp,
                datetime: reading.dateTime
              });
            }
          }
        } catch (error) {
          console.log('Temperature data not available or error:', error.message);
        }
      }
      
      if (samples.length > 0) {
        await this.dataService.sample_repository.store_samples(samples);
      }

      await this.dataService.sync_log_repository.update_sync_log(
        'other_health_data',
        now.toISOString(),
        'success',
        {}
      );

      console.log(`Other health data sync completed: ${samples.length} samples processed`);
      return samples.length;
    } catch (error) {
      await this.dataService.sync_log_repository.update_sync_log(
        'other_health_data',
        now.toISOString(),
        'error',
        {},
        error.message
      );
      throw error;
    }
  }

  /**
   * Synchronize all available data types for a given date.
   * @param {string} [dateStr] - Date string (YYYY-MM-DD). Defaults to today.
   * @param {string[]} [sampleTypes] - Array of sample types to sync (activity, heartrate, sleep, other).
   * @returns {Promise<object>} Results object with sample counts per type.
   * @throws {Error} On sync failure.
   */
  async syncAllData(dateStr = null, sampleTypes = null) {
    console.log('Starting full data sync...');
    const results = {};
    
    try {
      // Check rate limit before starting
      const rateLimitStatus = await this.dataService.sync_log_repository.get_rate_limit_status();
      
      console.log(`📊 Pre-sync rate limit check: ${rateLimitStatus.rate_limit_remaining} requests remaining`);
      
      if (rateLimitStatus.rate_limit_remaining < 10) {
        const resetTime = rateLimitStatus.rate_limit_reset;
        const resetDate = resetTime > 0 ? new Date(Date.now() + resetTime * 1000) : new Date();
        resetDate.setHours(resetDate.getHours() + 1, 0, 0, 0); // Next hour if no specific reset time
        
        console.error(`🚫 Rate limit too low for sync operation:`);
        console.error(`   Current remaining: ${rateLimitStatus.rate_limit_remaining} requests`);
        console.error(`   Minimum required: 10 requests`);
        console.error(`   Reset time: ${resetTime} seconds`);
        console.error(`   Reset at: ${resetDate.toLocaleString()}`);
        
        throw new Error(`Rate limit too low: ${rateLimitStatus.rate_limit_remaining} requests remaining (need at least 10). Rate limit resets in ${resetTime} seconds at ${resetDate.toLocaleString()}`);
      }

      // Determine which data types to sync
      const shouldSyncActivity = !sampleTypes || sampleTypes.includes('activity');
      const shouldSyncHeartrate = !sampleTypes || sampleTypes.includes('heartrate');
      const shouldSyncSleep = !sampleTypes || sampleTypes.includes('sleep');
      const shouldSyncOther = !sampleTypes || sampleTypes.includes('other');

      // Sync each data type based on selection
      if (shouldSyncActivity && this.scopes.includes('activity')) {
        results.activity = await this.syncActivityData(dateStr);
      }
      
      if (shouldSyncHeartrate && this.scopes.includes('heartrate')) {
        results.heartrate = await this.syncHeartRateData(dateStr);
      }
      
      if (shouldSyncSleep && this.scopes.includes('sleep')) {
        results.sleep = await this.syncSleepData(dateStr);
      }
      
      // Sync other health data
      if (shouldSyncOther) {
        results.other = await this.syncOtherData(dateStr);
      }
      
      console.log('Full sync completed:', results);
      return results;
    } catch (error) {
      console.error('Sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Synchronize all available data types for a date range.
   * @param {string} startDate - Start date (YYYY-MM-DD).
   * @param {string} endDate - End date (YYYY-MM-DD).
   * @param {string[]} [sampleTypes] - Array of sample types to sync.
   * @returns {Promise<{results: object, totalSamples: number, datesProcessed: number}>} Sync results.
   * @throws {Error} On sync failure or excessive date range.
   */
  async syncDateRange(startDate, endDate, sampleTypes = null) {
    console.log(`Starting date range sync from ${startDate} to ${endDate}...`);
    const results = {};
    const dates = this.getDateRange(startDate, endDate);
    
    try {
      // Check rate limit before starting
      const rateLimitStatus = await this.dataService.sync_log_repository.get_rate_limit_status();
      const requiredRequests = dates.length * 4; // Approximate requests per date
      
      console.log(`📊 Pre-sync rate limit check for date range:`);
      console.log(`   Date range: ${startDate} to ${endDate} (${dates.length} days)`);
      console.log(`   Current remaining: ${rateLimitStatus.rate_limit_remaining} requests`);
      console.log(`   Estimated required: ${requiredRequests} requests`);

      if (rateLimitStatus.rate_limit_remaining < requiredRequests) {
        const resetTime = rateLimitStatus.rate_limit_reset;
        const resetDate = resetTime > 0 ? new Date(Date.now() + resetTime * 1000) : new Date();
        resetDate.setHours(resetDate.getHours() + 1, 0, 0, 0); // Next hour if no specific reset time
        
        console.error(`🚫 Rate limit too low for date range sync operation:`);
        console.error(`   Current remaining: ${rateLimitStatus.rate_limit_remaining} requests`);
        console.error(`   Required for operation: ${requiredRequests} requests`);
        console.error(`   Shortfall: ${requiredRequests - rateLimitStatus.rate_limit_remaining} requests`);
        console.error(`   Reset time: ${resetTime} seconds`);
        console.error(`   Reset at: ${resetDate.toLocaleString()}`);
        
        throw new Error(`Rate limit too low: ${rateLimitStatus.rate_limit_remaining} requests remaining, need approximately ${requiredRequests} for ${dates.length} days. Shortfall: ${requiredRequests - rateLimitStatus.rate_limit_remaining} requests. Rate limit resets in ${resetTime} seconds at ${resetDate.toLocaleString()}`);
      }

      // Determine which data types to sync
      const shouldSyncActivity = !sampleTypes || sampleTypes.includes('activity');
      const shouldSyncHeartrate = !sampleTypes || sampleTypes.includes('heartrate');
      const shouldSyncSleep = !sampleTypes || sampleTypes.includes('sleep');
      const shouldSyncOther = !sampleTypes || sampleTypes.includes('other');

      let totalSamples = 0;
      
      for (const dateStr of dates) {
        console.log(`Syncing data for ${dateStr}...`);
        
        const dayResults = {};
        
        // Sync each data type for this date based on selection
        if (shouldSyncActivity && this.scopes.includes('activity')) {
          dayResults.activity = await this.syncActivityData(dateStr);
          totalSamples += dayResults.activity;
        }
        
        if (shouldSyncHeartrate && this.scopes.includes('heartrate')) {
          dayResults.heartrate = await this.syncHeartRateData(dateStr);
          totalSamples += dayResults.heartrate;
        }
        
        if (shouldSyncSleep && this.scopes.includes('sleep')) {
          dayResults.sleep = await this.syncSleepData(dateStr);
          totalSamples += dayResults.sleep;
        }
        
        if (shouldSyncOther) {
          dayResults.other = await this.syncOtherData(dateStr);
          totalSamples += dayResults.other;
        }
        
        results[dateStr] = dayResults;
        
        // Small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`Date range sync completed: ${totalSamples} total samples processed across ${dates.length} days`);
      return { results, totalSamples, datesProcessed: dates.length };
    } catch (error) {
      console.error('Date range sync failed:', error.message);
      throw error;
    }
  }

  /**
   * Get an array of date strings for a date range (inclusive).
   * @param {string} startDate - Start date (YYYY-MM-DD).
   * @param {string} endDate - End date (YYYY-MM-DD).
   * @returns {string[]} Array of date strings.
   * @throws {Error} If start date is after end date or range is too large.
   */
  getDateRange(startDate, endDate) {
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Validate dates
    if (start > end) {
      throw new Error('Start date must be before or equal to end date');
    }
    
    // Limit to prevent excessive API calls
    const maxDays = 30;
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    if (daysDiff > maxDays) {
      throw new Error(`Date range too large. Maximum ${maxDays} days allowed, requested ${daysDiff} days`);
    }
    
    const current = new Date(start);
    while (current <= end) {
      dates.push(this.getLocalDateString(current));
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  }
}

export default FitbitService;
