import LiveDataSocketService from '../services/ui/live.data.socket.service.js';
import { RSI, MACD } from 'technicalindicators';
import { logger } from '../utils/logger.util.js';
import { getDB, getMongoClient } from '../utils/mongodb.util.js';
import { OrderService } from '../services/order.service.js';
import { calculateSellPrice } from '../utils/sell.price.util.js';

export class IntradayMACDRSIStrategy {
    constructor(liveDataService, stockSymbol, candlePeriod = 30, rsiPeriod = 14, macdParams = { fast: 12, slow: 26, signal: 9 }) {
        this.liveDataService = liveDataService;
        this.stockSymbol = stockSymbol;
        this.candlePeriod = candlePeriod;
        this.rsiPeriod = rsiPeriod;
        this.macdParams = macdParams;
        this.candleService = new LiveDataSocketService(candlePeriod);
        this.macdCloses = [];
        this.rsiCloses = [];
        this.lastSignal = null;
        this.initialized = false;

        // Trading variables
        this.capital = 100; // Example: 10,000 INR
        this.margin = 5;      // Example: 5x
        this.profitPercent = 0.1965; // Example: 0.2%
        this.hasTradedToday = false;
        this.position = null; // { buyPrice, quantity, orderId }
        this.orderService = null;
        this.stateCollectionName = `${this.stockSymbol}_strategy_state`;
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
        // Get ticks from the last 1 day (24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const oldTicks = await collection.find({ timestamp: { $gte: oneDayAgo } }).sort({ timestamp: 1 }).toArray();
        for (const tick of oldTicks) {
            const candle = this.candleService.formCandle(tick);
            if (candle) {
                this.rsiCloses.push(candle.close);
                this.macdCloses.push(candle.close);
            }
        }
        this.initialized = true;
        logger.info(`[MACD+RSI] Loaded ${oldTicks.length} ticks from DB for ${this.stockSymbol}`);
    }

    async buyStock(packet, accessToken) {
        const finalCapital = this.capital * this.margin;
        const quantity = Math.floor(finalCapital / packet.last_traded_price);
        if (quantity <= 0) {
            logger.info(`[MACD+RSI] Not enough capital to buy any quantity for ${this.stockSymbol}`);
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
            logger.info(`[MACD+RSI] BUY order placed: ${orderId}, Qty: ${quantity}, Price: ${packet.last_traded_price}`);
            this.position = { buyPrice: packet.last_traded_price, quantity, orderId };
            this.hasTradedToday = true;
            await this.saveState();
            return orderId;
        } catch (err) {
            logger.error(`[MACD+RSI] Error placing BUY order: ${err.message}`);
            return null;
        }
    }

    async sellStock(packet, accessToken) {
        if (!this.position) return null;
        const sellPrice = calculateSellPrice(this.position.buyPrice, this.profitPercent);
        const orderService = new OrderService(accessToken);
        const orderParams = {
            tradingsymbol: this.stockSymbol,
            exchange: 'NSE',
            transaction_type: 'SELL',
            order_type: 'LIMIT',
            price: sellPrice,
            quantity: this.position.quantity,
            product: 'MIS',
            validity: 'DAY'
        };
        try {
            const orderId = await orderService.placeOrder(orderParams);
            logger.info(`[MACD+RSI] SELL order placed: ${orderId}, Qty: ${this.position.quantity}, Price: ${sellPrice}`);
            this.position = null;
            await this.saveState();
            return orderId;
        } catch (err) {
            logger.error(`[MACD+RSI] Error placing SELL order: ${err.message}`);
            return null;
        }
    }

    start(accessToken) {
        this.initHistorical().then(() => {
            logger.info(`[MACD+RSI] Starting intraday strategy for ${this.stockSymbol}`);
            this.liveDataService.subscribeToLiveData(async (packet) => {
                const candle = this.candleService.formCandle({ ...packet, timestamp: new Date() });
                if (candle) {
                    this.rsiCloses.push(candle.close);
                    this.macdCloses.push(candle.close);

                    // Calculate RSI
                    let rsi = null;
                    if (this.rsiCloses.length >= this.rsiPeriod) {
                        rsi = RSI.calculate({ period: this.rsiPeriod, values: this.rsiCloses }).slice(-1)[0];
                    }

                    // Calculate MACD
                    let macd = null;
                    if (this.macdCloses.length >= this.macdParams.slow) {
                        const macdArr = MACD.calculate({
                            values: this.macdCloses,
                            fastPeriod: this.macdParams.fast,
                            slowPeriod: this.macdParams.slow,
                            signalPeriod: this.macdParams.signal,
                            SimpleMAOscillator: false,
                            SimpleMASignal: false
                        });
                        if (macdArr.length > 0) {
                            macd = macdArr[macdArr.length - 1];
                        }
                    }

                    // Generate signal
                    let signal = 'HOLD';
                    if (macd && rsi !== null && rsi !== undefined) {
                        if (macd.MACD > macd.signal && rsi > 50) {
                            signal = 'BUY';
                        } else if (macd.MACD < macd.signal && rsi < 50) {
                            signal = 'SELL';
                        }
                    }

                    // Trading logic: Only one trade per day, state in DB
                    if (!this.hasTradedToday && signal === 'BUY' && !this.position) {
                        // await this.buyStock(packet, accessToken);
                    }
                    if (this.position && signal === 'SELL') {
                        // Check if profit target met using last_traded_price
                        const targetSellPrice = calculateSellPrice(this.position.buyPrice, this.profitPercent);
                        if (packet.last_traded_price >= targetSellPrice) {
                            // await this.sellStock(packet, accessToken);
                        }
                    }

                    if (signal !== this.lastSignal) {
                        logger.info(`[MACD+RSI] ${this.stockSymbol} Signal: ${signal} | Candle: ${JSON.stringify(candle)} | RSI: ${rsi} | MACD: ${macd ? JSON.stringify(macd) : 'N/A'}`);
                        this.lastSignal = signal;
                    }
                }
            });
        });
    }
}

export default IntradayMACDRSIStrategy;
