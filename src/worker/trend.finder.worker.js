import { workerData, parentPort } from 'worker_threads';
import { TrendFinderService } from '../services/trend.finder.service.js';
import { logger } from '../utils/logger.util.js';


(async () => {
    try {
        const { accessToken, interval, intervalType, timeLineLength } = workerData;
        
        logger.info(`Worker started for ${interval} ${intervalType} interval`);
        
        const trendFinder = new TrendFinderService(accessToken, interval, intervalType, timeLineLength);
        await trendFinder.init();
        await trendFinder.insertHistoricalData();
        
        
        parentPort.postMessage(`Worker completed for ${interval} ${intervalType} interval`);
    } catch (error) {
        parentPort.postMessage(`Worker error: ${error.message}`);
        process.exit(1);
    } finally {
        process.exit(0);
    }
})();