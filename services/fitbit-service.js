import axios from 'axios';

class FitbitService {
  constructor(database) {
    this.db = database;
    this.baseURL = 'https://api.fitbit.com';
    this.scopes = this.loadScopes();
  }

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

  async ensureValidToken() {
    const tokens = await this.db.getTokens();
    
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

  async refreshToken() {
    const tokens = await this.db.getTokens();
    
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
      
      await this.db.storeTokens(
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

  getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  extractRateLimitInfo(response) {
    return {
      remaining: parseInt(response.headers['fitbit-rate-limit-remaining']) || 0,
      resetIn: parseInt(response.headers['fitbit-rate-limit-reset']) || 0,
      limit: parseInt(response.headers['fitbit-rate-limit-limit']) || 150
    };
  }

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
      
      // Log rate limit status
      if (rateLimitInfo.remaining < 20) {
        console.warn(`Rate limit low: ${rateLimitInfo.remaining}/${rateLimitInfo.limit} remaining, resets in ${rateLimitInfo.resetIn}s`);
      }

      return { data: response.data, rateLimitInfo };
    } catch (error) {
      if (error.response?.status === 429) {
        const resetTime = error.response.headers['fitbit-rate-limit-reset'];
        console.error(`Rate limit exceeded. Resets in ${resetTime} seconds`);
        throw new Error(`Rate limit exceeded. Try again in ${resetTime} seconds`);
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
        await this.db.storeSamples(samples);
      }

      await this.db.updateSyncLog(
        'activity',
        now.toISOString(),
        'success',
        stepsResponse.rateLimitInfo
      );

      console.log(`Activity sync completed: ${samples.length} samples processed`);
      
      return samples.length;
    } catch (error) {
      await this.db.updateSyncLog(
        'activity',
        now.toISOString(),
        'error',
        {},
        error.message
      );

      throw error;
    }
  }

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

  processCaloriesData(dataset, bmrPerMinute, dateStr) {
    const samples = [];
    
    for (const dataPoint of dataset) {
      const totalCalories = parseFloat(dataPoint.value);
      const activeCalories = Math.max(0, totalCalories - bmrPerMinute);
      
      if (activeCalories > 0) {
        const timestamp = new Date(`${dateStr}T${dataPoint.time}`);
        samples.push({
          type: 'activeCalories',
          value: activeCalories,
          datetime: timestamp.toISOString()
        });
      }
    }
    
    return samples;
  }

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
      
      for (const dataPoint of dataset) {
        const heartRate = parseInt(dataPoint.value);
        if (heartRate > 0) {
          const timestamp = new Date(`${today}T${dataPoint.time}`);
          samples.push({
            type: 'heartRate',
            value: heartRate,
            datetime: timestamp.toISOString()
          });
        }
      }
      
      if (samples.length > 0) {
        await this.db.storeSamples(samples);
      }

      await this.db.updateSyncLog(
        'heartrate',
        now.toISOString(),
        'success',
        response.rateLimitInfo
      );

      console.log(`Heart rate sync completed: ${samples.length} samples processed`);
      return samples.length;
    } catch (error) {
      await this.db.updateSyncLog(
        'heartrate',
        now.toISOString(),
        'error',
        {},
        error.message
      );
      throw error;
    }
  }

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
        await this.db.storeSamples(samples);
      }

      await this.db.updateSyncLog(
        'sleep',
        now.toISOString(),
        'success',
        response.rateLimitInfo
      );

      console.log(`Sleep sync completed: ${samples.length} samples processed`);
      return samples.length;
    } catch (error) {
      await this.db.updateSyncLog(
        'sleep',
        now.toISOString(),
        'error',
        {},
        error.message
      );
      throw error;
    }
  }

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
        await this.db.storeSamples(samples);
      }

      await this.db.updateSyncLog(
        'other_health_data',
        now.toISOString(),
        'success',
        {}
      );

      console.log(`Other health data sync completed: ${samples.length} samples processed`);
      return samples.length;
    } catch (error) {
      await this.db.updateSyncLog(
        'other_health_data',
        now.toISOString(),
        'error',
        {},
        error.message
      );
      throw error;
    }
  }

  async syncAllData(dateStr = null, sampleTypes = null) {
    console.log('Starting full data sync...');
    const results = {};
    
    try {
      // Check rate limit before starting
      const rateLimitStatus = await this.db.getRateLimitStatus();

      if (rateLimitStatus.rate_limit_remaining < 10) {
        throw new Error(`Rate limit too low: ${rateLimitStatus.rate_limit_remaining} requests remaining`);
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

  async syncDateRange(startDate, endDate, sampleTypes = null) {
    console.log(`Starting date range sync from ${startDate} to ${endDate}...`);
    const results = {};
    const dates = this.getDateRange(startDate, endDate);
    
    try {
      // Check rate limit before starting
      const rateLimitStatus = await this.db.getRateLimitStatus();
      const requiredRequests = dates.length * 4; // Approximate requests per date

      if (rateLimitStatus.rate_limit_remaining < requiredRequests) {
        throw new Error(`Rate limit too low: ${rateLimitStatus.rate_limit_remaining} requests remaining, need approximately ${requiredRequests}`);
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
