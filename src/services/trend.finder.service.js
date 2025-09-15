// trend.finder.service.js
// Service to read curated stock lists from MongoDB and print symbols arrays
import { MongoClient } from 'mongodb';
import { HistoricalDataExecutor } from './historical.data.executor.js';
import { FilteredStockListWriter } from './filtered.stock.list.writer.js';
import { TrendDiscoveryVerification } from './trend.discovery.verification.service.js';
import { logger } from '../utils/logger.util.js';

const MONGO_URI = 'mongodb://localhost:27017'; // Adjust if needed
const DB_NAME = 'stockdb';
const COLLECTION_NAME = 'curated_stock_lists';

export class TrendFinderService {
    constructor(accessToken, interval, intervalType, timeLineLength, identificationDate = null) {
        this.mongoUri = MONGO_URI;
        this.client = new MongoClient(this.mongoUri);
        this.db = null;
        this.collection = null;
        this.accessToken = accessToken;
        this.interval = interval;
        this.intervalType = intervalType;
        this.timeLineLength = timeLineLength;
        this.identificationDate = identificationDate;
    }

    async init() {
        try {
            await this.client.connect();
            this.db = this.client.db(DB_NAME);
            this.collection = this.db.collection(COLLECTION_NAME);
            logger.info(`[TrendFinderService] Connected to MongoDB at ${this.mongoUri}`);
        } catch (err) {
            logger.error('[TrendFinderService] Failed to connect to MongoDB:', err);
            throw err;
        }
    }

    getDateString(dateObj){
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    async insertHistoricalData() {
        if (!this.collection) {
            throw new Error('MongoDB collection not initialized. Call init() first.');
        }
        try {
            // Get today's date in YYYY-MM-DD format
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const todayString = `${year}-${month}-${day}`;
            

            // Query documents with today's date
            const cursor = this.collection.find({ date: todayString });
            let count = 0;
            while (await cursor.hasNext()) {
                const doc = await cursor.next();
                if (Array.isArray(doc.symbols)) {
                    logger.info(`[TrendFinderService] Total docs: ${doc.symbols.length}`);
                    for (let idx = 0; idx < doc.symbols.length; idx++) {
                        const symbol = doc.symbols[idx];
                        logger.info(`[TrendFinderService] finding data for : ${symbol}`);
                        if(this.identificationDate){
                            logger.info(`[TrendFinderService] verification : ${symbol}`);
                            const trendDiscoveryVerification = new TrendDiscoveryVerification(this.accessToken, symbol, this.interval, this.intervalType, this.timeLineLength, this.identificationDate);
                            await trendDiscoveryVerification.execute();
                        } else {
                            logger.info(`[TrendFinderService] finder : ${symbol}`);
                            const historicalDataExecutor = new HistoricalDataExecutor(this.accessToken, symbol, this.interval, this.intervalType, this.timeLineLength);
                            await historicalDataExecutor.execute();
                        }
                        

                    }
                } else {
                    logger.info(`[TrendFinderService] Document _id: ${doc._id} has no symbols array.`);
                }
                count++;
            }
            const dbName = `trend_finder_${this.interval == 1 ? '' : this.interval}${this.intervalType}_${this.getDateString(this.identificationDate)}`;
            if(this.identificationDate && count > 0){
                const dataBase = this.client.db(dbName)
                const success = await dataBase.collection('trend_bearish').countDocuments({ trendIdentification : "SUCCESS" });
                const failure = await dataBase.collection('trend_bearish').countDocuments({ trendIdentification : "FAILURE" });
                logger.info(`[TrendFinderService] prediction success : ${success} failure : ${failure}.`);
            }
            if (count === 0) {
                logger.info('[TrendFinderService] No documents found in curated_stock_lists.');
            }
            
            const writer = new FilteredStockListWriter({ timePeriod: 300, outputFile: `stock_list_${this.interval}_${this.intervalType}_${this.getDateString(this.identificationDate)}.json`, dbName });
            await writer.writeFilteredList();
        } catch (err) {
            logger.error('[TrendFinderService] Error reading documents:', err);
        }
    }

    async close() {
        if (this.client) {
            await this.client.close();
            logger.info('[TrendFinderService] MongoDB connection closed.');
        }
    }
}

// Example usage (uncomment to run directly)
// (async () => {
//     const service = new TrendFinderService();
//     await service.init();
//     await service.printCuratedSymbols();
//     await service.close();
// })();
