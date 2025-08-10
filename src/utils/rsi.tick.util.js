import { RSI } from 'technicalindicators';
import { logger } from '../utils/logger.util.js';
import { getDB, getMongoClient } from './mongodb.util.js';

export class LiveRSICalculator {
    constructor(period = 14, stockSymbol = null) {
        this.period = period;
        this.values = [];
        this.timestamp = [];
        this.rsiInstance = null;
        this.lastRSI = null;
        this.stockSymbol = stockSymbol;
        this.historicalLoaded = false;
        this.loadHistoricalCloses();
    }

    async loadHistoricalCloses() {
        if (!this.stockSymbol) return;
        await getMongoClient();
        const db = getDB();
        const collection = db.collection(`${this.stockSymbol}_HIST`);
        // Fetch all closes sorted by timestamp ascending
        const docs = await collection.find({}, { projection: { close: 1, timestamp: 1 } }).sort({ timestamp: 1 }).toArray();
        this.values = docs.map(doc => doc.close);
        this.timestamp = docs.map(doc => doc.timestamp).slice(14, this.values.length); // Adjust timestamp to match values
        this.historicalLoaded = true;
        // logger.info(`Loaded ${this.values.length} historical closes for ${this.stockSymbol}_HIST`);
    }

    /**
     * Zerodha Kite uses the standard 14-period RSI (Wilder's smoothing) on close prices.
     * To match Kite's RSI:
     * - Use only close prices (no OHLC average)
     * - Use period=14 (or your desired period)
     * - Feed values in order, do not reset the RSI instance
     * - Do not re-initialize RSI instance after enough data, just call nextValue for each new close
     */
    nextValue(close) {
        // if (this.stockSymbol && !this.historicalLoaded) {
        //     await this.loadHistoricalCloses();
        // }
        this.values.push(close);
        if (!this.rsiInstance && this.values.length >= this.period) {
            this.rsiInstance = new RSI({ period: this.period, values: this.values });
            const initial = this.rsiInstance.getResult();
            this.lastRSI = initial.length ? initial[initial.length - 1] : null;
            return this.lastRSI;
        }
        if (this.rsiInstance) {
            this.lastRSI = this.rsiInstance.nextValue(close);
            return this.lastRSI;
        }
        logger.info(`current available values count ${this.values.length}, required period ${this.period}`);
        return null; // Not enough data yet
    }

    /**
     * Returns the complete list of RSI values for the loaded close values.
     * @returns {Array<number>}
     */
    getAllRSI() {
        if (this.values.length < this.period) return [];
        // Use technicalindicators RSI static method for all values
        return {rsiData: RSI.calculate({ period: this.period, values: this.values }), timestamp: this.timestamp};
    }
}
