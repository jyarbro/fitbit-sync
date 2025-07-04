import { schedule } from 'node-cron';

export default function setupBackgroundSync({ fitbitService, db }) {
  // Active hours sync (every 5 minutes, 8am-8pm)
  schedule('*/5 8-20 * * *', async () => {
    try {
      console.log('Running scheduled sync (active hours)...');
      await fitbitService.syncAllData();
    } catch (error) {
      console.error('Scheduled sync failed:', error.message);
    }
  });

  // Sleep hours sync (every hour, 8pm-8am)
  schedule('0 20-23,0-8 * * *', async () => {
    try {
      console.log('Running scheduled sync (sleep hours)...');
      await fitbitService.syncAllData();
    } catch (error) {
      console.error('Scheduled sync failed:', error.message);
    }
  });

  // Daily cleanup (every day at 3am)
  schedule('0 3 * * *', async () => {
    try {
      console.log('Running daily cleanup...');
      await db.cleanupOldSamples(30); // Keep 30 days
    } catch (error) {
      console.error('Daily cleanup failed:', error.message);
    }
  });

  console.log('Background sync scheduler initialized');
}
