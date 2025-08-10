import { MongoClient } from 'mongodb';
import { logger } from './logger.util.js';

const url = 'mongodb://localhost:27017';
// const dbName = 'autotrade';
let client = null;

export async function getMongoClient() {
    if (!client) {
        try {
            client = new MongoClient(url);
            await client.connect();
            logger.info('Connected to MongoDB');
        } catch (err) {
            logger.error(`MongoDB connection error: ${err.message}`);
            throw err;
        }
    }
    return client;
}

export function getDB(dbName = "autotrade") {
    if (!client) {
        throw new Error('MongoDB client not initialized');
    }
    return client.db(dbName);
}
