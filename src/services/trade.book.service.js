import { getDB, getMongoClient } from '../utils/mongodb.util.js';
import { logger } from '../utils/logger.util.js';

export class TradeBookService {
    constructor(stockSymbol) {
        this.stockSymbol = stockSymbol;
        this.collectionName = `${stockSymbol}_trade_book`;
    }

    async ensureMongoReady() {
        await getMongoClient();
    }

    /**
     * Call this after buying the stock.
     * @param {Object} trade - { buyPrice, buyTime, quantity }
     * @returns {Promise<string>} - Returns inserted trade _id
     */
    async recordBuy(trade) {
        await this.ensureMongoReady();
        const db = getDB('trade_book');
        const collection = db.collection(this.collectionName);
        const doc = {
            buyPrice: trade.buyPrice,
            buyTime: trade.buyTime || new Date(),
            quantity: trade.quantity,
            totalBuyValue: trade.buyPrice * trade.quantity,
            status: 'OPEN',
            buyISTTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            strategy: trade?.strategy || 'TREND_FOLLOWING',
        };
        const result = await collection.insertOne(doc);
        logger.info(`[TradeBook] Buy recorded: ${JSON.stringify(doc)}`);
        return result.insertedId;
    }

    /**
     * Call this after selling the stock.
     * @param {Object} params - { tradeId, sellPrice, sellTime, quantity }
     * @returns {Promise<void>}
     */
    async recordSell({ tradeId, sellPrice, sellTime, quantity }) {
        await this.ensureMongoReady();
        const db = getDB('trade_book');
        const collection = db.collection(this.collectionName);

        // Find the buy record
        const buyTrade = await collection.findOne({ _id: tradeId });
        if (!buyTrade) {
            logger.error(`[TradeBook] No buy record found for tradeId: ${tradeId}`);
            return;
        }

        const totalSellValue = sellPrice * quantity;
        const profit = totalSellValue - (buyTrade.buyPrice * buyTrade.quantity);
        const profitPercent = ((profit / (buyTrade.buyPrice * buyTrade.quantity)) * 100).toFixed(4);
        const sellTimeObj = sellTime ? new Date(sellTime) : new Date();
        const buyTimeObj = new Date(buyTrade.buyTime);
        const durationMinutes = Math.round((sellTimeObj - buyTimeObj) / 60000);

        await collection.updateOne(
            { _id: tradeId },
            {
                $set: {
                    sellPrice,
                    sellTime: sellTimeObj,
                    sellQuantity: quantity,
                    totalSellValue,
                    profit,
                    profitPercent: Number(profitPercent),
                    durationMinutes,
                    status: 'CLOSED',
                    sellISTTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                }
            }
        );
        logger.info(`[TradeBook] Sell recorded for tradeId ${tradeId}: sellPrice=${sellPrice}, profit=${profit}, duration=${durationMinutes}min`);
    }
}

export default TradeBookService;
