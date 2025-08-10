// trend.finder.service.js
// Service to read curated stock lists from MongoDB and print symbols arrays
import { MongoClient } from 'mongodb';
import { HistoricalDataExecutor } from './historical.data.executor.js';

const MONGO_URI = 'mongodb://localhost:27017'; // Adjust if needed
const DB_NAME = 'stockdb';
const COLLECTION_NAME = 'curated_stock_lists';

export class TrendFinderService {
    constructor(accessToken) {
        this.mongoUri = MONGO_URI;
        this.client = new MongoClient(this.mongoUri);
        this.db = null;
        this.collection = null;
        this.accessToken = accessToken;
    }

    async init() {
        try {
            await this.client.connect();
            this.db = this.client.db(DB_NAME);
            this.collection = this.db.collection(COLLECTION_NAME);
            console.log(`[TrendFinderService] Connected to MongoDB at ${this.mongoUri}`);
        } catch (err) {
            console.error('[TrendFinderService] Failed to connect to MongoDB:', err);
            throw err;
        }
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
                    console.log(`[TrendFinderService] Total docs: ${doc.symbols.length}`);
                    for (let idx = 0; idx < doc.symbols.length; idx++) {
                        const symbol = doc.symbols[idx];
                        console.log(`[TrendFinderService] finding data for : ${symbol}`);
                        const historicalDataExecutor = new HistoricalDataExecutor(this.accessToken, symbol, 100);
                        await historicalDataExecutor.execute();
                    }
                } else {
                    console.log(`[TrendFinderService] Document _id: ${doc._id} has no symbols array.`);
                }
                count++;
            }
            if (count === 0) {
                console.log('[TrendFinderService] No documents found in curated_stock_lists.');
            }
        } catch (err) {
            console.error('[TrendFinderService] Error reading documents:', err);
        }
    }

    async close() {
        if (this.client) {
            await this.client.close();
            console.log('[TrendFinderService] MongoDB connection closed.');
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
