import { getDB, getMongoClient } from '../utils/mongodb.util.js';

export class TradeDetailsService {
    constructor() {}

    /**
     * Fetch trade details for a given stock symbol and date.
     * @param {string} stockSymbol
     * @param {string} date - Format: 'YYYY-MM-DD'
     * @returns {Promise<Array<{buyPrice: number, buyTime: string, sellPrice: number, sellTime: string}>>}
     */
    async getTradeDetails(stockSymbol, date) {
        await getMongoClient();
        const db = getDB('trade_book');
        const collection = db.collection(`${stockSymbol}_trade_book`);
        // Start and end of the day in UTC
        const start = new Date(date + 'T00:00:00.000Z');
        const end = new Date(date + 'T23:59:59.999Z');
        // Find trades where buyTime or sellTime falls within the date
        const trades = await collection.find({
            $or: [
                { buyTime: { $gte: start, $lte: end } },
                { sellTime: { $gte: start, $lte: end } }
            ]
        }, {
            projection: { buyPrice: 1, buyTime: 1, sellPrice: 1, sellTime: 1, strategy: 1 }
        }).toArray();
        return trades.map(trade => ({
            buyPrice: trade.buyPrice,
            buyTime: trade.buyTime,
            sellPrice: trade.sellPrice,
            sellTime: trade.sellTime,
            strategy: trade.strategy || 'TREND_FOLLOWING' // Default to 'UNKNOWN' if strategy not set
        }));
    }
}

export default TradeDetailsService;
