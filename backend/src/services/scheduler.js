/**
 * Background job scheduler for sync and cleanup tasks.
 * @module backend/services/scheduler
 */
import { schedule } from 'node-cron';

/**
 * Set up background sync and cleanup jobs using node-cron.
 * Schedules periodic data syncs and sample cleanup.
 *
 * @param {object} params - Scheduler dependencies.
 * @param {object} params.fitbitService - FitbitService instance for data sync.
 * @param {object} params.dataService - DataService instance for repositories.
 */
export default function setupBackgroundSync({ fitbitService, dataService }) {
  schedule('*/5 8-20 * * *', async () => {
    try {
      await fitbitService.syncAllData();
    } catch (error) {}
  });
  schedule('0 20-23,0-8 * * *', async () => {
    try {
      await fitbitService.syncAllData();
    } catch (error) {}
  });
  schedule('0 3 * * *', async () => {
    try {
      await dataService.sample_repository.cleanup_old_samples(30);
    } catch (error) {}
  });
}
