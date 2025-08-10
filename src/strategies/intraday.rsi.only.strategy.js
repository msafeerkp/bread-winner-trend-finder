import LiveDataSocketService from '../services/ui/live.data.socket.service.js';
import { RSI } from 'technicalindicators';
import { logger } from '../utils/logger.util.js';
import { getDB, getMongoClient } from '../utils/mongodb.util.js';
import { OrderService } from '../services/order.service.js';
import { calculateSellPrice } from '../utils/sell.price.util.js';
import TradeBookService from '../services/trade.book.service.js';

export class IntradayRSIOnlyStrategy {
    constructor(liveDataService, stockSymbol, candlePeriod = 30, rsiPeriod = 14) {
        this.liveDataService = liveDataService;
        this.stockSymbol = stockSymbol;
        this.candlePeriod = candlePeriod;
        this.rsiPeriod = rsiPeriod;
        this.candleService = new LiveDataSocketService(candlePeriod);
        this.rsiCloses = [];
        this.lastSignal = null;
        this.initialized = false;

        // TradeBook
        this.tradeBookService = new TradeBookService(stockSymbol);

        // Trading variables
        this.capital = 10000; // Example: 10,000 INR
        this.margin = 5;      // Example: 5x
        this.profitPercent = 0.1965; // Example: 0.2%
        this.hasTradedToday = false;
        this.position = null; // { buyPrice, quantity, orderId }
        this.stateCollectionName = `${this.stockSymbol}_rsi_strategy_state`;
        this.lastRSI = null;
        this.minRSI = null;
        this.waitingForRise = false;
    }

    async loadState() {
        await getMongoClient();
        const db = getDB();
        const collection = db.collection(this.stateCollectionName);
        const state = await collection.findOne({ _id: 'state' });
        if (state) {
            this.hasTradedToday = state.hasTradedToday || false;
            this.position = state.position || null;
        }
    }

    async saveState() {
        await getMongoClient();
        const db = getDB();
        const collection = db.collection(this.stateCollectionName);
        await collection.updateOne(
            { _id: 'state' },
            { $set: { hasTradedToday: this.hasTradedToday, position: this.position } },
            { upsert: true }
        );
    }

    async resetStateIfNewDay() {
        await getMongoClient();
        const db = getDB();
        const collection = db.collection(this.stateCollectionName);
        const state = await collection.findOne({ _id: 'state' });
        const today = new Date().toISOString().slice(0, 10);
        if (!state || state.lastTradeDay !== today) {
            this.hasTradedToday = false;
            this.position = null;
            await collection.updateOne(
                { _id: 'state' },
                { $set: { hasTradedToday: false, position: null, lastTradeDay: today } },
                { upsert: true }
            );
        }
    }

    async initHistorical() {
        await this.resetStateIfNewDay();
        await this.loadState();
        await getMongoClient();
        const db = getDB();
        const collection = db.collection(`${this.stockSymbol}_tick`);
        // Get ticks from the start of previous day (00:00:00)
        const now = new Date();
        const prevDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
        const oldTicks = await collection.find({ timestamp: { $gte: prevDay } }).sort({ timestamp: 1 }).toArray();
        for (const tick of oldTicks) {
            const candle = this.candleService.formCandle(tick);
            if (candle) {
                this.rsiCloses.push(candle.close);
            }
        }
        this.initialized = true;
        logger.info(`[RSI-ONLY] Loaded ${oldTicks.length} ticks from DB for ${this.stockSymbol}`);
    }

    async buyStock(packet, accessToken) {
        const finalCapital = this.capital * this.margin;
        const quantity = Math.floor(finalCapital / packet.last_traded_price);
        if (quantity <= 0) {
            logger.info(`[RSI-ONLY] Not enough capital to buy any quantity for ${this.stockSymbol}`);
            return null;
        }
        const orderService = new OrderService(accessToken);
        const orderParams = {
            tradingsymbol: this.stockSymbol,
            exchange: 'NSE',
            transaction_type: 'BUY',
            order_type: 'MARKET',
            quantity,
            product: 'MIS',
            validity: 'DAY'
        };
        try {
            const orderId = await orderService.placeOrder(orderParams);
            logger.info(`[RSI-ONLY] BUY order placed: ${orderId}, Qty: ${quantity}, Price: ${packet.last_traded_price}`);
            const tradeRecordId = await this.tradeBookService.recordBuy({ 
                buyPrice: packet.last_traded_price, buyTime: new Date(), quantity 
            });
            this.position = { buyPrice: packet.last_traded_price, quantity, orderId, tradeRecordId };
            this.hasTradedToday = true;
            await this.saveState();
            return orderId;
        } catch (err) {
            logger.error(`[RSI-ONLY] Error placing BUY order: ${err.message}`);
            return null;
        }
    }

    async sellStock(packet, accessToken, exitType = "LIMIT") {
        if (!this.position) return null;
        let sellPrice = calculateSellPrice(this.position.buyPrice, this.profitPercent);
        let orderType = 'LIMIT';
        if (exitType === "MARKET_SELL") {
            // If exit type is MARKET_SELL, use last traded price
            sellPrice = packet?.last_traded_price;
            orderType = 'MARKET';
        }
        const orderService = new OrderService(accessToken);
        const orderParams = {
            tradingsymbol: this.stockSymbol,
            exchange: 'NSE',
            transaction_type: 'SELL',
            order_type: orderType,
            price: sellPrice,
            quantity: this.position.quantity,
            product: 'MIS',
            validity: 'DAY'
        };
        try {
            const orderId = await orderService.placeOrder(orderParams);
            logger.info(`[RSI-ONLY] SELL order placed: ${orderId}, Qty: ${this.position.quantity}, Price: ${sellPrice}`);
            await this.tradeBookService.recordSell({ 
                tradeId: this.position.tradeRecordId, sellPrice, sellTime: new Date(), quantity: this.position.quantity 
            });
            this.position = null;
            await this.saveState();
            return orderId;
        } catch (err) {
            logger.error(`[RSI-ONLY] Error placing SELL order: ${err.message}`);
            return null;
        }
    }

    start(accessToken) {
        this.initHistorical().then(() => {
            logger.info(`[RSI-ONLY] Starting intraday RSI-only strategy for ${this.stockSymbol}`);
            this.liveDataService.subscribeToLiveData(async (packet) => {
                const candle = this.candleService.formCandle({ ...packet, timestamp: new Date() });
                if (candle) {
                    this.rsiCloses.push(candle.close);

                    // Calculate RSI
                    let rsi = null;
                    if (this.rsiCloses.length >= this.rsiPeriod) {
                        rsi = RSI.calculate({ period: this.rsiPeriod, values: this.rsiCloses }).slice(-1)[0];
                    }

                    // --- RSI Buy Logic ---
                    // Buy when RSI is between 30 and 35, hits minimum, and starts rising
                    let signal = 'HOLD';
                    if (rsi !== null && rsi !== undefined) {
                        if (rsi >= 30 && rsi <= 35) {
                            if (this.minRSI === null || rsi < this.minRSI) {
                                this.minRSI = rsi;
                                this.waitingForRise = true;
                            } else if (this.waitingForRise && rsi > this.minRSI) {
                                signal = 'BUY';
                                this.waitingForRise = false;
                            }
                        }
                        // Reset minRSI if RSI goes above 35
                        if (rsi > 35) {
                            this.minRSI = null;
                            this.waitingForRise = false;
                        }
                        // Sell when RSI is below 28
                        if (this.position && rsi < 28) {
                            signal = 'SELL';
                        }
                    }

                    // Trading logic: Only one trade per day, state in DB
                    if (!this.hasTradedToday && signal === 'BUY' && !this.position) {
                        await this.buyStock(packet, accessToken);
                    }
                    if (this.position) {
                        // Sell if RSI below 28 or profit met
                        if (signal === 'SELL') {
                            await this.sellStock(packet, accessToken, "MARKET_SELL");
                        }
                    }

                    if (signal !== this.lastSignal) {
                        // logger.info(`[RSI-ONLY] ${this.stockSymbol} Signal: ${signal} | Candle: ${JSON.stringify(candle)} | RSI: ${rsi}`);
                        this.lastSignal = signal;
                    }
                }
                if (this.position) {
                    const targetSellPrice = calculateSellPrice(this.position.buyPrice, this.profitPercent);
                    if (packet.last_traded_price >= targetSellPrice) {
                        await this.sellStock(packet, accessToken);
                    }
                }
            });
        });
    }
}

export default IntradayRSIOnlyStrategy;
