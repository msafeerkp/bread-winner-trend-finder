import { MongoClient } from 'mongodb';
import { DistributedLockService } from './distributed.lock.service.js';
import { logger } from '../utils/logger.util.js';

export class StockResourceService {
    constructor(clientId, stockSymbols, mongoUrl = 'mongodb://localhost:27017', dbName = 'stockdb') {
        this.stockSymbols = stockSymbols;
        this.mongoUrl = mongoUrl;
        this.dbName = dbName;
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        this.collectionName = `stock_resources_${yyyy}_${mm}_${dd}`;
        this.client = null;
        this.db = null;
        this.collection = null;
        this.lockService = new DistributedLockService();
        this.clientId = clientId;
        
        logger.info(`[StockResourceService] Initialized with ${stockSymbols.length} stock symbols`);
        
    }

    async initialize() {
        try {
            try {
                this.lockService.connect();
                logger.info('[StockResourceService] Connecting to MongoDB...');
                this.client = new MongoClient(this.mongoUrl);
                await this.client.connect();
                this.db = this.client.db(this.dbName);
                this.collection = this.db.collection(this.collectionName);
                logger.info(`[StockResourceService] Connected to MongoDB database: ${this.dbName}, collection: ${this.collectionName}`);

                // Check if today's collection exists and has data
                const count = await this.collection.countDocuments();
                if (count > 0) {
                    logger.info(`[StockResourceService] Today's collection already exists with ${count} documents. Skipping initialization.`);
                    return;
                }
                // Insert all stock symbols as documents
                await this.insertStockDocuments();
            } catch (error) {
                logger.error('[StockResourceService] Failed to initialize: ' + error.message);
                throw error;
            }
        } catch (error) {
            logger.error('[StockResourceService] Failed to initialize: ' + error.message);
            throw error;
        }
    }

    async insertStockDocuments() {
        try {
            logger.info('[StockResourceService] Inserting stock documents...');
            
            const documents = this.stockSymbols.map(symbol => ({
                stockSymbol: symbol,
                acquiredClient: "",
                tradeStatus: ""
            }));

            // Use upsert to avoid duplicates
            const bulkOps = documents.map(doc => ({
                updateOne: {
                    filter: { stockSymbol: doc.stockSymbol },
                    update: { $setOnInsert: doc },
                    upsert: true
                }
            }));

            const result = await this.collection.bulkWrite(bulkOps);
            
            logger.info(`[StockResourceService] Inserted/Updated documents - Inserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}`);
            
        } catch (error) {
            logger.error('[StockResourceService] Failed to insert stock documents: ' + error.message);
            throw error;
        }
    }

    async acquireResource(stockSymbol) {
        const lockKey = `stock_lock_acquire_${stockSymbol}`;
        
        try {
            logger.info(`[StockResourceService] Attempting to acquire resource for stock: ${stockSymbol}`);
            
            // First check the current trade status without acquiring lock
            const currentStock = await this.collection.findOne({ stockSymbol: stockSymbol });
            
            if (!currentStock) {
                logger.error(`[StockResourceService] Stock symbol not found: ${stockSymbol}`);
                return false;
            }
            
            // Check trade status before acquiring lock
            if (currentStock.tradeStatus === "OPEN") {
                logger.info(`[StockResourceService] Stock ${stockSymbol} is already OPEN, cannot acquire`);
                return false;
            }
            
            if (currentStock.tradeStatus === "") {
                logger.info(`[StockResourceService] Stock ${stockSymbol} is available (empty status), proceeding to acquire`);
                
                // Acquire distributed lock
                const lockAcquired = await this.lockService.acquireLock(lockKey, 30);
                
                if (!lockAcquired) {
                    logger.error(`[StockResourceService] Failed to acquire distributed lock for stock: ${stockSymbol}`);
                    return false;
                }

                logger.info(`[StockResourceService] Distributed lock acquired for stock: ${stockSymbol}`);

                // Double-check the status after acquiring lock (to prevent race conditions)
                const recheck = await this.collection.findOne({ stockSymbol: stockSymbol });
                if (recheck.tradeStatus !== "") {
                    logger.info(`[StockResourceService] Stock ${stockSymbol} status changed during lock acquisition, cannot proceed`);
                    return false; // lock is still held, must be released by caller
                }
                
                // Update trade status to OPEN
                const updateResult = await this.collection.updateOne(
                    { stockSymbol: stockSymbol, tradeStatus: "" }, // Only update if still empty
                    { 
                        $set: { 
                            tradeStatus: "OPEN",
                            acquiredClient: this.clientId,
                            openedDate: new Date()
                        }
                    }
                );

                if (updateResult.matchedCount === 0) {
                    logger.info(`[StockResourceService] Stock ${stockSymbol} was modified by another process, acquisition failed`);
                    return false; // lock is still held, must be released by caller
                }

                logger.info(`[StockResourceService] Successfully acquired resource for stock: ${stockSymbol}, status set to OPEN`);
                return true;

            }
            
            // If tradeStatus is neither "" nor "OPEN" (e.g., "CLOSED"), return false
            logger.info(`[StockResourceService] Stock ${stockSymbol} has status '${currentStock.tradeStatus}', cannot acquire`);
            return false;

        } catch (error) {
            logger.error(`[StockResourceService] Error acquiring resource for stock ${stockSymbol}: ${error.message}`); 
            return false;
        }
    }

    async releaseResource(stockSymbol) {
        const lockKey = `stock_lock_release_${stockSymbol}`;
        try {
            logger.info(`[StockResourceService] Attempting to release resource for stock: ${stockSymbol}`);
            // Acquire distributed lock
            const lockAcquired = await this.lockService.acquireLock(lockKey, 30);
            if (!lockAcquired) {
                logger.error(`[StockResourceService] Failed to acquire distributed lock for stock release: ${stockSymbol}`);
                return false;
            }
            logger.info(`[StockResourceService] Distributed lock acquired for stock release: ${stockSymbol}`);
            // Double-check the status after acquiring lock
            const currentStock = await this.collection.findOne({ stockSymbol });
            if (!currentStock) {
                logger.error(`[StockResourceService] Stock symbol not found: ${stockSymbol}`);
                return false;
            }
            if (currentStock.tradeStatus !== "OPEN") {
                logger.info(`[StockResourceService] Stock ${stockSymbol} is not OPEN, cannot release (current status: '${currentStock.tradeStatus}')`);
                return false;
            }
            // Update trade status to CLOSED
            const updateResult = await this.collection.updateOne(
                { stockSymbol, tradeStatus: "OPEN" },
                { $set: { tradeStatus: "CLOSED", acquiredClient: this.clientId, closedDate: new Date() } }
            );
            if (updateResult.matchedCount === 0) {
                logger.info(`[StockResourceService] Stock ${stockSymbol} was modified by another process, release failed`);
                return false;
            }
            logger.info(`[StockResourceService] Successfully released resource for stock: ${stockSymbol}, status set to CLOSED`);
            return true;
        } catch (error) {
            logger.error(`[StockResourceService] Error releasing resource for stock ${stockSymbol}: ${error.message}`);
            return false;
        }
    }
}
