/**
 * Background job scheduler for sync and cleanup tasks.
 * @module backend/services/scheduler
 */
import { schedule } from 'node-cron';

/**
 * Set up background sync and cleanup jobs.
 * @param {object} params
 * @param {object} params.fitbitService
 * @param {object} params.db
 */
export default function setupBackgroundSync({ fitbitService, db }) {
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
      await db.cleanupOldSamples(30);
    } catch (error) {}
  });
}
