import LiveDataSocketService from '../services/ui/live.data.socket.service.js';
import { EMA, RSI } from 'technicalindicators';
import { logger } from '../utils/logger.util.js';
import { getDB, getMongoClient } from '../utils/mongodb.util.js';
import { OrderService } from '../services/order.service.js';
import { calculateSellPrice } from '../utils/sell.price.util.js';
import TradeBookService from '../services/trade.book.service.js';

export class EMAVolumeRSIStrategy {
    constructor(capitalService, liveDataService, stockSymbol, candlePeriod = 1, rsiPeriod = 14) {
        this.capitalService = capitalService;
        this.liveDataService = liveDataService;
        this.stockSymbol = stockSymbol;
        this.candlePeriod = candlePeriod;
        this.rsiPeriod = rsiPeriod;
        this.candleService = new LiveDataSocketService(candlePeriod);
        this.closeArr = [];
        this.volumeArr = [];
        this.lastSignal = null;
        this.initialized = false;

        // TradeBook
        this.tradeBookService = new TradeBookService(stockSymbol);

        // Trading variables
        this.capital = 10000;
        this.margin = 5;
        this.profitPercent = 0.1965;
        this.hasTradedToday = false;
        this.position = null;
        this.stateCollectionName = `${this.stockSymbol}_ema_volume_rsi_strategy_state`;
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
        // Get ticks from the start of previous trading day (00:00:00)
        const now = new Date();
        let prevDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
        // If prevDay is Saturday (6), Sunday (0), or Monday (1), go back to Friday (5)
        if (prevDay.getDay() === 6) { // Saturday
            prevDay.setDate(prevDay.getDate() - 1); // Friday
        } else if (prevDay.getDay() === 0) { // Sunday
            prevDay.setDate(prevDay.getDate() - 2); // Friday
        } else if (prevDay.getDay() === 1) { // Monday
            prevDay.setDate(prevDay.getDate() - 3); // Friday
        }
        const oldTicks = await collection.find({ timestamp: { $gte: prevDay } }).sort({ timestamp: 1 }).toArray();
        for (const tick of oldTicks) {
            const candle = this.candleService.formCandle(tick);
            if (candle) {
                this.closeArr.push(candle.close);
                this.volumeArr.push(candle.volume);
            }
        }
        this.initialized = true;
        logger.info(`[EMA-VOLUME-RSI] Loaded ${oldTicks.length} ticks from DB for ${this.stockSymbol}`);
    }

    async buyStock(packet, accessToken) {
        const finalCapital = this.capital * this.margin;
        const quantity = Math.floor(finalCapital / packet.last_traded_price);
        if (quantity <= 0) {
            logger.info(`[EMA-VOLUME-RSI] Not enough capital to buy any quantity for ${this.stockSymbol}`);
            return null;
        }
        const isAvailable = await this.capitalService.checkCapitalAvailability(this.capital);
        if (!isAvailable) {
            logger.info(`[EMA-VOLUME-RSI] Insufficient capital to buy for ${this.stockSymbol}`);
            return null;
        }
        await this.capitalService.deductCapital(this.capital);
        logger.info(`[EMA-VOLUME-RSI] Deducted capital: ${this.capital} for ${this.stockSymbol}`);
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
            logger.info(`[EMA-VOLUME-RSI] BUY order placed: ${orderId}, Qty: ${quantity}, Price: ${packet.last_traded_price}`);
            const tradeRecordId = await this.tradeBookService.recordBuy({ 
                buyPrice: packet.last_traded_price, buyTime: new Date(), quantity 
            });
            this.position = { buyPrice: packet.last_traded_price, quantity, orderId, tradeRecordId };
            this.hasTradedToday = true;
            await this.saveState();
            return orderId;
        } catch (err) {
            logger.error(`[EMA-VOLUME-RSI] Error placing BUY order: ${err.message}`);
            return null;
        }
    }

    async sellStock(packet, accessToken, exitType = "LIMIT") {
        if (!this.position) return null;
        let sellPrice = calculateSellPrice(this.position.buyPrice, this.profitPercent);
        let orderType = 'LIMIT';
        if (exitType === "MARKET_SELL") {
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
            logger.info(`[EMA-VOLUME-RSI] SELL order placed: ${orderId}, Qty: ${this.position.quantity}, Price: ${sellPrice}`);
            await this.tradeBookService.recordSell({ 
                tradeId: this.position.tradeRecordId, sellPrice, sellTime: new Date(), quantity: this.position.quantity 
            });
            this.position = null;
            await this.saveState();
            return orderId;
        } catch (err) {
            logger.error(`[EMA-VOLUME-RSI] Error placing SELL order: ${err.message}`);
            return null;
        }
    }

    start(accessToken) {
        this.initHistorical().then(() => {
            logger.info(`[EMA-VOLUME-RSI] Starting EMA+Volume+RSI strategy for ${this.stockSymbol}`);
            this.liveDataService.subscribeToLiveData(async (packet) => {
                const candle = this.candleService.formCandle({ ...packet, timestamp: new Date() });
                if (candle) {
                    this.closeArr.push(candle.close);
                    this.volumeArr.push(candle.volume);

                    // Calculate EMAs
                    let ema9 = null, ema21 = null;
                    if (this.closeArr.length >= 21) {
                        ema9 = EMA.calculate({ period: 9, values: this.closeArr }).slice(-1)[0];
                        ema21 = EMA.calculate({ period: 21, values: this.closeArr }).slice(-1)[0];
                    }

                    // Calculate RSI
                    let rsi = null;
                    if (this.closeArr.length >= this.rsiPeriod) {
                        rsi = RSI.calculate({ period: this.rsiPeriod, values: this.closeArr }).slice(-1)[0];
                    }

                    // Volume confirmation: compare last green candle volume to previous
                    let volumeSurge = false;
                    if (this.volumeArr.length >= 2 && candle.close > candle.open) {
                        const lastVol = this.volumeArr[this.volumeArr.length - 1];
                        const prevVol = this.volumeArr[this.volumeArr.length - 2];
                        volumeSurge = lastVol > prevVol;
                    }

                    // --- EMA+Volume+RSI Logic ---
                    let signal = 'HOLD';
                    if (
                        ema9 !== null && ema21 !== null && rsi !== null &&
                        candle.close > ema9 && ema9 > ema21 &&
                        rsi > 50 && volumeSurge
                    ) {
                        // Entry: 9 EMA crosses above 21 EMA, price above both, RSI > 50, volume surge
                        signal = 'BUY';
                    }
                    if (
                        this.position &&
                        (candle.close < ema9 || rsi < 50)
                    ) {
                        // Exit: price closes below 9 EMA or RSI < 50
                        signal = 'SELL';
                    }

                    if (!this.hasTradedToday && signal === 'BUY' && !this.position) {
                        await this.buyStock(packet, accessToken);
                    }
                    if (this.position && signal === 'SELL') {
                        await this.sellStock(packet, accessToken, "MARKET_SELL");
                    }

                    if (signal !== this.lastSignal) {
                        logger.info(`[EMA-VOLUME-RSI] ${this.stockSymbol} Signal: ${signal} | Candle: ${JSON.stringify(candle)} | EMA9: ${ema9} | EMA21: ${ema21} | RSI: ${rsi}`);
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

export default EMAVolumeRSIStrategy;
