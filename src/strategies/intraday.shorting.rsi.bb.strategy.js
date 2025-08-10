import LiveDataSocketService from '../services/ui/live.data.socket.service.js';
import { RSI, BollingerBands } from 'technicalindicators';
import { logger } from '../utils/logger.util.js';
import { getDB, getMongoClient } from '../utils/mongodb.util.js';
import { OrderService } from '../services/order.service.js';
import { calculateSellPrice } from '../utils/sell.price.util.js';
import TradeBookService from '../services/trade.book.service.js';
import { PositionService } from '../services/position.service.js';
import { Mutex } from 'async-mutex';
import { BollingerExitPatternDetector } from '../services/bollinger.exit.pattern.detector.js';
import { BollingerBandShrinkingDetectorService } from '../services/bollinger.band.shrinking.detector.service.js';

export class IntradayShortingRSIBBStrategy {
    constructor(clientId, stockResourceService, capitalService, liveDataService, stockSymbol, candlePeriod = 10, rsiPeriod = 14, bbPeriod = 20, bbStdDev = 2) {
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
        this.clientId = clientId;

        // TradeBook
        this.tradeBookService = new TradeBookService(stockSymbol);

        //stock resource
        this.stockResourceService = stockResourceService;

        // Trading variables
        this.capital = 100000;
        this.margin = 5;
        this.profitPercent = 0.1965;
        this.hasTradedToday = false;
        this.position = null;
        this.stateCollectionName = `${this.clientId}_${this.stockSymbol}_short_stg_state`;
        this.coverMutex = new Mutex();
        this.coverTriggered = false;
        this.lossMinimizer = new BollingerExitPatternDetector();
        this.bbShrinkingDetector = new BollingerBandShrinkingDetectorService();
    }

    async loadState() {
        await getMongoClient();
        const db = getDB("trade_strategy");
        const collection = db.collection(this.stateCollectionName);
        const state = await collection.findOne({ _id: 'state' });
        if (state) {
            this.hasTradedToday = state.hasTradedToday || false;
            this.position = state.position || null;
        }
    }

    async saveState() {
        await getMongoClient();
        const db = getDB("trade_strategy");
        const collection = db.collection(this.stateCollectionName);
        await collection.updateOne(
            { _id: 'state' },
            { $set: { hasTradedToday: this.hasTradedToday, position: this.position } },
            { upsert: true }
        );
    }

    async resetStateIfNewDay() {
        await getMongoClient();
        const db = getDB("trade_strategy");
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
        logger.info(`[SHORT-RSI-BB] Loaded ${oldTicks.length} ticks from DB for ${this.stockSymbol} with RSI initial values : ${initialRSI.length}`);
    }

    isShortingWindowClosed() {
        const now = new Date();
        const indiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const hour = indiaTime.getHours();
        const minute = indiaTime.getMinutes();
        // 11:00 AM IST closing window
        return (hour >= 11 && minute > 0);
    }

    async shortStock(packet, accessToken) {
        if(this.isShortingWindowClosed()){
            logger.info(`[SHORT-RSI-BB] shorting window closed ${this.stockSymbol}`);
            return null;
        }
        const finalCapital = this.capital * this.margin;
        const quantity = Math.floor(finalCapital / packet.last_traded_price);
        if (quantity <= 0) {
            logger.info(`[SHORT-RSI-BB] Not enough capital to short any quantity for ${this.stockSymbol}`);
            return null;
        }

        const orderService = new OrderService(accessToken);
        const orderParams = {
            tradingsymbol: this.stockSymbol,
            exchange: 'NSE',
            transaction_type: 'SELL',
            order_type: 'MARKET',
            quantity,
            product: 'MIS',
            validity: 'DAY'
        };
        try {
            const isAvailable = await this.capitalService.checkCapitalAvailability(this.capital);
            if (!isAvailable) {
                logger.info(`[SHORT-RSI-BB] Insufficient capital to short for ${this.stockSymbol} missed oppurtunity trade. client Id ${this.clientId}`);
                this.hasTradedToday = true;
                this.position = null;
                await this.saveState();
                return null;
            }
            const stockResourceAvailability = await this.stockResourceService.acquireResource(this.stockSymbol);
            if(!stockResourceAvailability){
                logger.info(`[SHORT-RSI-BB] Already traded the stock: ${this.stockSymbol}`);
                return null;
            }
            await this.capitalService.deductCapital(this.capital);
            logger.info(`[SHORT-RSI-BB] Deducted capital: ${this.capital} for ${this.stockSymbol}`);
            const orderId = await orderService.placeOrder(orderParams);
            logger.info(`[SHORT-RSI-BB] SHORT order placed: ${orderId}, Qty: ${quantity}, Price: ${packet.last_traded_price}`);
            const positionService = new PositionService(accessToken);
            const positionData = await positionService.getCurrentPosition(this.stockSymbol);
            if (positionData) {
                let acquiredQuantity = positionData?.quantity ? positionData?.quantity * -1 : 0;
                let entryPrice = positionData?.sellPrice || packet.last_traded_price;
                const tradeRecordId = await this.tradeBookService.recordBuy({ 
                    buyPrice: entryPrice, buyTime: new Date(), strategy: "SHORT", quantity: acquiredQuantity // For short, treat as "entry"
                });
                this.position = { entryPrice: entryPrice, quantity: acquiredQuantity, orderId, tradeRecordId };
                logger.info(`[SHORT-RSI-BB] Position acquired: ${JSON.stringify(this.position)}`);
            }
            this.hasTradedToday = true;
            await this.saveState();
            return orderId;
        } catch (err) {
            logger.error(`[SHORT-RSI-BB] Error placing SHORT order: ${err.message}`);
            return null;
        }
    }

    async coverStock(packet, accessToken, exitType = "LIMIT") {
        try {
            if (!this.position) return null;
            let coverPrice = calculateSellPrice(this.position.entryPrice, -this.profitPercent); // Negative for short
            let orderType = 'LIMIT';
            if (exitType === "MARKET_COVER") {
                coverPrice = packet?.last_traded_price;
                orderType = 'MARKET';
                logger.info(`[SHORT-RSI-BB] Breached!!!. MARKET_COVER coverPrice: ${coverPrice}, Qty: ${this.position.quantity}`);
            }
            const positionService = new PositionService(accessToken);
            const positionData = await positionService.getCurrentPosition(this.stockSymbol);
            if (positionData) {
                let acquiredQuantity = positionData?.quantity ? positionData?.quantity * -1 : 0;
                this.position.quantity = acquiredQuantity;
                logger.info(`[SHORT-RSI-BB] Fetched position details for accuracy. stock: ${this.stockSymbol}`);
            }
            const orderService = new OrderService(accessToken);
            const orderParams = {
                tradingsymbol: this.stockSymbol,
                exchange: 'NSE',
                transaction_type: 'BUY',
                order_type: orderType,
                price: coverPrice,
                quantity: this.position.quantity,
                product: 'MIS',
                validity: 'DAY'
            };

            const orderId = await orderService.placeOrder(orderParams);
            logger.info(`[SHORT-RSI-BB] COVER order placed: ${orderId}, Qty: ${this.position.quantity}, Price: ${coverPrice}`);
            await this.tradeBookService.recordSell({ 
                tradeId: this.position.tradeRecordId, sellPrice: coverPrice, sellTime: new Date(), quantity: this.position.quantity 
            });
            this.position = null;
            await this.saveState();
            await this.capitalService.addCapital(this.capital);
            await this.stockResourceService.releaseResource(this.stockSymbol);
            return orderId;
        } catch (err) {
            logger.error(`[SHORT-RSI-BB] Error placing COVER order: ${err.message}`);
            return null;
        }
    }

    async insertTradedCandle(candle) {
        await getMongoClient();
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1;
        const year = today.getFullYear();
        const db = getDB(`${this.clientId}_traded_stock_data_${day}_${month}_${year}`);
        const collection = db.collection(`${this.stockSymbol}_tick`);
        await collection.insertOne(candle);
    }

    start(accessToken) {
        this.initHistorical().then(() => {
            logger.info(`[SHORT-RSI-BB] Starting intraday shorting RSI+BB strategy for ${this.stockSymbol}`);
            // State for BB break logic
            let bbBreakDetected = false;
            let afterFirstBreak = false;
            let candlesSinceFirstBreak = 0;
            let allCandlesUnderMiddleBB = true;
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

                    // --- Shorting Logic ---
                    // 1. Wait for lower BB break
                    // 2. After first break, wait for at least one candle (skip immediate next candle)
                    // 3. All candles between first and second break must close <= upper BB
                    // 4. If any candle closes above upper BB, reset
                    // 5. On second lower BB break, RSI must be >= 35 and <= 50

                    let signal = 'HOLD';
                    if (rsi !== null && bb !== null) {
                        if (!this.position && !bbBreakDetected && candle.close < bb.lower) {
                            // First lower BB break detected
                            bbBreakDetected = true;
                            afterFirstBreak = true;
                            candlesSinceFirstBreak = 0;
                            allCandlesUnderMiddleBB = true;
                            logger.info(`[SHORT-RSI-BB] First lower BB break detected, waiting for second break (skip next candle). stock: ${this.stockSymbol}. Candle: ${JSON.stringify(candle)} BB: ${bb ? JSON.stringify(bb) : 'N/A'}`);
                        } else if (!this.position && bbBreakDetected) {
                            let isShrinking = this.bbShrinkingDetector.detectShrinkage({ upper: bb.upper, lower: bb.lower, middle: bb.middle }, candle);
                            logger.info(`[SHORT-RSI-BB] is Bollinger Band is Shrinking: ${isShrinking}. stock: ${this.stockSymbol}`);
                            candlesSinceFirstBreak += 1;
                            if (isShrinking){
                                // Reset if any BB shrinks
                                bbBreakDetected = false;
                                afterFirstBreak = false;
                                candlesSinceFirstBreak = 0;
                                allCandlesUnderMiddleBB = true;
                                logger.info(`[SHORT-RSI-BB] BB shrinked after first break, resetting BB break state. stock: ${this.stockSymbol}`);
                            } else if (candle.close > bb.middle) { // Check for middle BB break in between
                                // Reset if any candle closes above middle BB
                                bbBreakDetected = false;
                                afterFirstBreak = false;
                                candlesSinceFirstBreak = 0;
                                allCandlesUnderMiddleBB = true;
                                logger.info(`[SHORT-RSI-BB] Candle closed above middle BB, resetting BB break state. stock: ${this.stockSymbol}`);
                            } else {
                                // Track if all candles are under or equal to middle BB
                                if (candle.close > bb.middle) {
                                    allCandlesUnderMiddleBB = false;
                                }
                                // Only consider second break after skipping immediate next candle
                                if (candlesSinceFirstBreak > 1 && candle.close < bb.lower && allCandlesUnderMiddleBB && rsi >= 35 && rsi <= 50) {
                                    signal = 'SHORT';
                                    bbBreakDetected = false;
                                    afterFirstBreak = false;
                                    candlesSinceFirstBreak = 0;
                                    allCandlesUnderMiddleBB = true;
                                    logger.info(`[SHORT-RSI-BB] Second lower BB break with RSI in range, short signal! stock: ${this.stockSymbol}`);
                                }
                            }
                        }

                        // Cover logic: RSI > 65 and candle close > upper BB
                        if (this.position && rsi > 65 && candle.close > bb.upper) {
                            signal = 'COVER';
                        }
                        if(this.position){
                            const minimizerResult = this.lossMinimizer.processCandle(candle, bb.upper, bb.middle, bb.lower);
                            if (minimizerResult?.shouldExit) {
                              logger.info(`[SHORT-RSI-BB] Choppy trade detected. stock: ${this.stockSymbol}`);
                              signal = 'COVER';
                            }
                        }
                    }
                    if (!this.hasTradedToday && signal === 'SHORT' && !this.position) {
                        await this.shortStock(packet, accessToken);
                    }
                    if (this.position) {
                        if (signal === 'COVER') {
                            await this.coverStock(packet, accessToken, "MARKET_COVER");
                        }
                    }

                    if (signal !== this.lastSignal) {
                        logger.info(`[SHORT-RSI-BB] ${this.stockSymbol} Signal: ${signal} | Candle: ${JSON.stringify(candle)} | RSI: ${rsi} | BB: ${bb ? JSON.stringify(bb) : 'N/A'} | bbBreakDetected: ${bbBreakDetected} | afterFirstBreak: ${afterFirstBreak} | candlesSinceFirstBreak: ${candlesSinceFirstBreak} | allCandlesUnderMiddleBB: ${allCandlesUnderMiddleBB}`);
                        this.lastSignal = signal;
                    }
                    await this.insertTradedCandle(candle);
                }
                if (this.position) {
                    const targetCoverPrice = calculateSellPrice(this.position.entryPrice, -this.profitPercent);
                    if (packet.last_traded_price <= targetCoverPrice) {
                        logger.info(`[SHORT-RSI-BB] Target cover price reached: ${targetCoverPrice}, acquiring lock for ${this.stockSymbol}`);
                        const releaseLock = await this.coverMutex.acquire();  // Locks until released
                        try {
                            if(this.coverTriggered === false) {
                                this.coverTriggered = true;  // Set flag to prevent multiple covers
                                logger.info(`[SHORT-RSI-BB] Target cover price reached: ${targetCoverPrice}, initiating cover for ${this.stockSymbol}`);
                                await this.coverStock(packet, accessToken);
                            } else {
                                logger.info(`[SHORT-RSI-BB] Position covering already started, skipping cover for ${this.stockSymbol}`);
                            }
                        }
                        finally {
                            releaseLock();  // Always release the lock
                            logger.info(`[SHORT-RSI-BB] Lock released for ${this.stockSymbol}`);
                        }
                    }
                }
            });
        });
    }
}

export default IntradayShortingRSIBBStrategy;
