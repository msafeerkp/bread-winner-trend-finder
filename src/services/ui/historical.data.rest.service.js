import { getDB, getMongoClient } from '../../utils/mongodb.util.js';
import { logger } from '../../utils/logger.util.js';
import { LiveRSICalculator } from '../../utils/rsi.tick.util.js';
import { MACD } from 'technicalindicators';

export class HistoricalDataRestService {
    /**
     * Fetch historical RSI data for a given stock symbol from MongoDB.
     * Uses LiveRSICalculator to compute RSI from historical closes.
     * @param {string} stockSymbol
     * @returns {Promise<Array<{timestamp: string, rsi: number}>>}
     */
    static async getHistoricalRSI(stockSymbol) {
        const rsiCalc = new LiveRSICalculator(14, stockSymbol);
        await rsiCalc.loadHistoricalCloses();
        const rsiList = rsiCalc.getAllRSI();
        return rsiList;
    }

    /**
     * Fetch historical candle data for a given stock symbol from MongoDB.
     * @param {string} stockSymbol
     * @returns {Promise<Array<{timestamp: string, open: number, high: number, low: number, close: number, volume: number}>>}
     */
    static async getHistoricalCandles(stockSymbol) {
        await getMongoClient();
        const db = getDB();
        const collection = db.collection(`${stockSymbol}_HIST`);
        // Fetch all documents sorted by timestamp ascending
        const docs = await collection.find(
            {},
            { projection: { timestamp: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 } }
        ).sort({ timestamp: 1 }).toArray();
        return docs.map(doc => ({
            timestamp: doc.timestamp,
            open: doc.open,
            high: doc.high,
            low: doc.low,
            close: doc.close,
            volume: doc.volume
        }));
    }

    /**
     * Fetch historical MACD data for a given stock symbol from MongoDB.
     * @param {string} stockSymbol
     * @returns {Promise<Array<{timestamp: string, macd: number, signal: number, histogram: number}>>}
     */
    static async getHistoricalMACD(stockSymbol) {
        await getMongoClient();
        const db = getDB();
        const collection = db.collection(`${stockSymbol}_HIST`);
        // Fetch all closes sorted by timestamp ascending
        const docs = await collection.find(
            {},
            { projection: { close: 1, timestamp: 1 } }
        ).sort({ timestamp: 1 }).toArray();
        const closes = docs.map(doc => doc.close);
        const timestamps = docs.map(doc => doc.timestamp);

        // MACD default: fast=12, slow=26, signal=9
        const macdInput = {
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        };
        const macdResult = MACD.calculate(macdInput);

        // Align timestamps: MACD output is shorter than closes, so align from the end
        const offset = closes.length - macdResult.length;
        return macdResult.map((item, idx) => ({
            timestamp: timestamps[idx + offset],
            macd: item.MACD,
            signal: item.signal,
            histogram: item.histogram
        }));
    }
}
