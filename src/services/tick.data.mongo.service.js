import { getDB, getMongoClient } from '../utils/mongodb.util.js';
import { logger } from '../utils/logger.util.js';
import { LiveDataService } from './live.data.service.js';

export class TickDataMongoService {
    constructor(wsService, accessToken, stockSymbol) {
        this.wsService = wsService;
        this.accessToken = accessToken;
        this.stockSymbol = stockSymbol;
        this.mongoReady = false;
        this.liveDataService = new LiveDataService(wsService, accessToken, stockSymbol);
    }

    async ensureMongoReady() {
        if (!this.mongoReady) {
            await getMongoClient();
            this.mongoReady = true;
        }
    }

    async insertTick(packet) {
        await this.ensureMongoReady();
        const db = getDB();
        const collection = db.collection(`${this.stockSymbol}_tick`);
        await collection.insertOne(packet);
    }

    async start() {
        logger.info(`TickDataMongoService: Subscribing and storing ticks for ${this.stockSymbol}`);
        await this.liveDataService.subscribeToLiveData(async (packet) => {
            try {
                // await this.insertTick(packet);
            } catch (err) {
                logger.error(`TickDataMongoService error: ${err.message}`);
            }
        });
    }
}

export default TickDataMongoService;
