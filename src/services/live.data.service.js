import { getInstrumentTokenByTradingSymbol } from '../utils/instrument.util.js';
import { getDB, getMongoClient } from '../utils/mongodb.util.js';
import { logger } from '../utils/logger.util.js';

class LiveDataService {
    constructor(wsService, accessToken, stockSymbol) {
        this.wsService = wsService;
        this.accessToken = accessToken;
        this.stockSymbol = stockSymbol;
        this.instrumentToken = null;
        this.mongoReady = false;
    }

    async getInstrumentToken() {
        if (!this.instrumentToken) {
            this.instrumentToken = await getInstrumentTokenByTradingSymbol(this.stockSymbol);
        }
        return this.instrumentToken;
    }

    async ensureMongoReady() {
        if (!this.mongoReady) {
            await getMongoClient();
            this.mongoReady = true;
        }
    }

    async insertTickData(packet) {
        try {
            await this.ensureMongoReady();
            const db = getDB();
            const collection = db.collection(this.stockSymbol);
            const tickData = {
                ...packet,
                timestamp: new Date()
            };
            await collection.insertOne(tickData);
        } catch (err) {
            logger.error(`Error inserting tick data: ${err.message}`);
        }
    }

    /**
     * Subscribe to live data for the stock symbol and receive continuous data via callback.
     * @param {(packet: Object) => void} onData
     */
    async subscribeToLiveData(onData) {
        const instrumentToken = await this.getInstrumentToken();
        if (!instrumentToken) {
            throw new Error(`Instrument token not found for symbol: ${this.stockSymbol}`);
        }
        this.wsService.subscribe([Number(instrumentToken)]);
        this.wsService.setMode('full', [Number(instrumentToken)]);
        this.wsService.onMessage(Number(instrumentToken), async (packet) => {
            // await this.insertTickData(packet);
            onData(packet);
        });
    }
}

export { LiveDataService };