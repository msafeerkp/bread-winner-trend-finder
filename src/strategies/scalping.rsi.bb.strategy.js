import LiveDataSocketService from '../services/ui/live.data.socket.service.js';
import { RSI, BollingerBands } from 'technicalindicators';
import { logger } from '../utils/logger.util.js';
import { getDB, getMongoClient } from '../utils/mongodb.util.js';
import { OrderService } from '../services/order.service.js';
import { calculateSellPrice } from '../utils/sell.price.util.js';
import TradeBookService from '../services/trade.book.service.js';

export class ScalpingRSIBBStrategy {
    constructor(capitalService, liveDataService, stockSymbol, candlePeriod = 10, rsiPeriod = 7, bbPeriod = 20, bbStdDev = 2) {
        this.capitalService = capitalService; 
        this.liveDataService = liveDataService;
        this.stockSymbol = stockSymbol;
        this.candlePeriod = candlePeriod;
        this.rsiPeriod = rsiPeriod;
        this.bbPeriod = bbPeriod;
        this.bbStdDev = bbStdDev;
        this.candleService = new LiveDataSocketService(candlePeriod);
        this.rsiCloses = [];
        this.bbCloses = [];
        this.lastSignal = null;
        this.initialized = false;

        // TradeBook
        this.tradeBookService = new TradeBookService(stockSymbol);

        // Trading variables
        this.capital = 9700;
        this.margin = 5;
        this.profitPercent = 0.1965; // Use 0.1965% to account for brokerage and ensure profit
        this.hasTradedToday = false;
        this.position = null;
        this.stateCollectionName = `${this.stockSymbol}_scalp_strategy_state`;
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
        // If prevDay is Saturday (6), Sunday (0), go back to Friday (5)
        if (prevDay.getDay() === 6) { // Saturday
            prevDay.setDate(prevDay.getDate() - 1); // Friday
        } else if (prevDay.getDay() === 0) { // Sunday
            prevDay.setDate(prevDay.getDate() - 2); // Friday
        }
        const oldTicks = await collection.find({ timestamp: { $gte: prevDay } }).sort({ timestamp: 1 }).toArray();
        for (const tick of oldTicks) {
            const candle = this.candleService.formCandle(tick);
            if (candle) {
                this.rsiCloses.push(candle.close);
                this.bbCloses.push(candle.close);
            }
        }
        this.rsiInstance = new RSI({ period: this.rsiPeriod, values: this.rsiCloses });
         const initialRSI = this.rsiInstance.getResult();
        this.initialized = true;
        logger.info(`[SCALP-RSI-BB] Loaded ${oldTicks.length} ticks from DB for ${this.stockSymbol} with RSI initial values : ${initialRSI.length}`);
    }

    async buyStock(packet, accessToken) {
        const finalCapital = this.capital * this.margin;
        const quantity = Math.floor(finalCapital / packet.last_traded_price);
        if (quantity <= 0) {
            logger.info(`[SCALP-RSI-BB] Not enough capital to buy any quantity for ${this.stockSymbol}`);
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
            const isAvailable = await this.capitalService.checkCapitalAvailability(this.capital);
            if (!isAvailable) {
                logger.info(`[SCALP-RSI-BB] Insufficient capital to buy for ${this.stockSymbol}`);
                return null;
            }
            await this.capitalService.deductCapital(this.capital);
            logger.info(`[SCALP-RSI-BB] Deducted capital: ${this.capital} for ${this.stockSymbol}`);
            const orderId = await orderService.placeOrder(orderParams);
            logger.info(`[SCALP-RSI-BB] BUY order placed: ${orderId}, Qty: ${quantity}, Price: ${packet.last_traded_price}`);
            const tradeRecordId = await this.tradeBookService.recordBuy({ 
                buyPrice: packet.last_traded_price, buyTime: new Date(), quantity 
            });
            this.position = { buyPrice: packet.last_traded_price, quantity, orderId, tradeRecordId };
            this.hasTradedToday = true;
            await this.saveState();
            return orderId;
        } catch (err) {
            logger.error(`[SCALP-RSI-BB] Error placing BUY order: ${err.message}`);
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
            logger.info(`[SCALP-RSI-BB] SELL order placed: ${orderId}, Qty: ${this.position.quantity}, Price: ${sellPrice}`);
            await this.tradeBookService.recordSell({ 
                tradeId: this.position.tradeRecordId, sellPrice, sellTime: new Date(), quantity: this.position.quantity 
            });
            this.position = null;
            await this.saveState();
            return orderId;
        } catch (err) {
            logger.error(`[SCALP-RSI-BB] Error placing SELL order: ${err.message}`);
            return null;
        }
    }

    start(accessToken) {
        this.initHistorical().then(() => {
            logger.info(`[SCALP-RSI-BB] Starting scalping RSI+BB strategy for ${this.stockSymbol}`);
            // State for BB break logic
            let bbBreakPending = false;
            this.liveDataService.subscribeToLiveData(async (packet) => {
                const candle = this.candleService.formCandle({ ...packet, timestamp: new Date() });
                if (candle) {
                    this.rsiCloses.push(candle.close);
                    this.bbCloses.push(candle.close);

                    // Calculate RSI
                    let rsi = null;
                    if (this.rsiCloses.length >= this.rsiPeriod) {
                        rsi = this.rsiInstance.nextValue(candle.close);
                    }

                    // Calculate Bollinger Bands
                    let bb = null;
                    if (this.bbCloses.length >= this.bbPeriod) {
                        const bbArr = BollingerBands.calculate({
                            period: this.bbPeriod,
                            stdDev: this.bbStdDev,
                            values: this.bbCloses
                        });
                        if (bbArr.length > 0) {
                            bb = bbArr[bbArr.length - 1];
                        }
                    }

                    // --- Scalping Logic with BB break and confirmation candle ---
                    let signal = 'HOLD';
                    if (rsi !== null && bb !== null) {
                        if (!this.position && !bbBreakPending && rsi <= 31 && candle.close <= bb.lower) {
                            // BB break detected, wait for next positive candle
                            bbBreakPending = true;
                            logger.info(`[SCALP-RSI-BB] BB break detected, waiting for confirmation candle... Stock : ${this.stockSymbol}`);
                        } else if (!this.position && bbBreakPending && rsi <= 35) {
                            // Wait for next positive candle after BB break
                            if (candle.close > candle.open && candle.close > bb.lower) {
                                signal = 'BUY';
                                bbBreakPending = false;
                                logger.info(`[SCALP-RSI-BB] BB break detected, confirmed posetive candle... Stock : ${this.stockSymbol}`);
                            } else if (candle.close > bb.lower) {
                                // If price goes above lower BB without confirmation, reset
                                bbBreakPending = false;
                            }
                        }
                        if (this.position && rsi <= 21) {
                            signal = 'SELL';
                        }
                    }
                    if (!this.hasTradedToday && signal === 'BUY' && !this.position) {
                        await this.buyStock(packet, accessToken);
                    }
                    if (this.position) {
                        if (signal === 'SELL') {
                            await this.sellStock(packet, accessToken, "MARKET_SELL");
                        }
                    }

                    if (signal !== this.lastSignal) {
                        logger.info(`[SCALP-RSI-BB] ${this.stockSymbol} Signal: ${signal} | Candle: ${JSON.stringify(candle)} | RSI: ${rsi} | BB: ${bb ? JSON.stringify(bb) : 'N/A'} | BBbreakPending: ${bbBreakPending}`);
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

export default ScalpingRSIBBStrategy;
