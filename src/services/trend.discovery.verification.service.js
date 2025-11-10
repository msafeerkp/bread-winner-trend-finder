import { HistoricalDataService } from './historical.data.service.js';
import { getDB, getMongoClient } from '../utils/mongodb.util.js';
import { logger } from '../utils/logger.util.js';
import { StockTrendAnalyzer } from './stock.trend.analyzer.js';
import { PATTERN_WEIGHTS } from './pattern.weights.js';
import { BullishFilterScenarios } from './bullish.filter.scenarios.js';
import { findResistanceLevels, findSupportLevels } from './support.finder.js';
import { DynamicRSIRangeFinder } from './dynamic.rsi.range.finder.js';

export class TrendDiscoveryVerification {
    constructor(accessToken, stockSymbol, interval= 'day', intervalType, numDays, trendBulls = true, trendBears = false) {
        this.accessToken = accessToken;
        this.stockSymbol = stockSymbol;
        this.numDays = numDays;
        this.historicalService = new HistoricalDataService(accessToken, stockSymbol);
        this.mongoReady = false;
        this.interval = interval;
        this.intervalType= intervalType;
        this.findBulls = trendBulls;
        this.findBears = trendBears;
    }

    async ensureMongoReady() {
        if (!this.mongoReady) {
            await getMongoClient();
            this.mongoReady = true;
        }
    }

    calculateTrendScores({bullish, bearish}) {
        const scores = { bullish: 0, bearish: 0};

        // Sum weights for each category
        // bullish?.length && bullish?.forEach(pattern => {
        //     scores.bullish += PATTERN_WEIGHTS[pattern] || 0;
        // });

        // bearish?.length && bearish?.forEach(pattern => {
        //     scores.bearish += PATTERN_WEIGHTS[pattern] || 0;
        // });

        return scores;
    }

    // Format: 'YYYY-MM-DD HH:mm:ss'
    formatDateTime(dt) {
        const pad = n => n.toString().padStart(2, '0');
        return (
            dt.getFullYear() + '-' +
            pad(dt.getMonth() + 1) + '-' +
            pad(dt.getDate()) + ' ' +
            pad(dt.getHours()) + ':' +
            pad(dt.getMinutes()) + ':' +
            pad(dt.getSeconds())
        );
    }

    async verify(){

        // Subtract previous day * 24 * 60 * 60 * 1000 milliseconds from current time (includes time, not just date). plus 2 is added to avoid weekend
        const fromDate = new Date(this.identificationDate.getTime() - 1 * 24 * 60 * 60 * 1000);

        const to = this.formatDateTime(this.identificationDate);
        const from = this.formatDateTime(fromDate);

        try {
            const candles = await this.historicalService.fetchHistoricalData({
                interval: `day`,
                from,
                to
            });
            const docs = candles.map(candle => ({
                timestamp: candle[0],
                open: candle[1],
                high: candle[2],
                low: candle[3],
                close: candle[4],
                volume: candle[5]
            }));
            logger.info(`Fetched ${candles.length} verify candles for ${this.stockSymbol}`);
            return docs[docs.length - 1];
        } catch(e){
            logger.error(`verify error: ${e.message}`);
        }
    }

    getDateString(dateObj){
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    isVerificationPossible(){ return false;
        const year = this.identificationDate.getFullYear();
        const month = this.identificationDate.getMonth()
        const day = this.identificationDate.getDate();
        
        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth();
        const todayDay = today.getDate();
        const todayHour = today.getHours();
        
        if(year == todayYear && month == todayMonth && day == todayDay && todayHour >= 16){
            logger.info("verification possible");
            return true;
        }
        logger.info("verification not possible");
        return false;
    }

    async execute() {

        let toDateDerived = new Date();
        let tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        let dateString = this.getDateString(tomorrowDate);
        if(toDateDerived.getHours() < 9){
            // toDateDerived = new Date(this.identificationDate.getTime() - 1 * 24 * 60 * 60 * 1000);
            dateString = this.getDateString(toDateDerived);
            toDateDerived.setDate(toDateDerived.getDate() - 1);
            toDateDerived.setHours(23); // to avoid the loss of full date data
        }
       
        // Subtract numDays * 24 * 60 * 60 * 1000 milliseconds from current time (includes time, not just date). plus 2 is added to avoid weekend
        const fromDate = new Date(toDateDerived.getTime() - (this.numDays * 24 * 60 * 60 * 1000));

        const to = this.formatDateTime(toDateDerived);
        const from = this.formatDateTime(fromDate);

        try {
            const candles = await this.historicalService.fetchHistoricalData({
                interval: `${this.interval == 1 ? '' : this.interval}${this.intervalType}`,
                from,
                to
            });
            logger.info(`Fetched ${candles.length} historical candles for ${this.stockSymbol}`);

            await this.ensureMongoReady();
            const db = getDB(`trend_finder_${this.interval == 1 ? '' : this.interval}${this.intervalType}_${dateString}`);
            const collection = db.collection(`${this.stockSymbol}_HIST`);
            const trendBearishCollection = db.collection(`trend_bearish`);
            const trendBullishCollection = db.collection(`trend_bullish`);
            const trendNeautralCollection = db.collection(`trend_neautral`);
            const vTrendPosetive = db.collection(`v_trend_bullish`);
            const vTrendNegetive = db.collection(`v_trend_bearish`);
            // Clear the collection before inserting new records
            await collection.deleteMany({});
            logger.info(`Cleared collection ${this.stockSymbol}_HIST before inserting new records`);
            // Each candle: [timestamp, open, high, low, close, volume]
            const docs = candles.map(candle => ({
                timestamp: candle[0],
                open: candle[1],
                high: candle[2],
                low: candle[3],
                close: candle[4],
                volume: candle[5]
            }));
            const stockTrendAnalyzer = new StockTrendAnalyzer(docs);
            const trend = stockTrendAnalyzer.analyze();
            const { bullish, bearish } = this.calculateTrendScores(trend);
            // Threshold: Bullish/Bearish must be 2x Neutral to override
            // if (bullish > bearish || 
            //     trend.BBStats.BBStats == "BB_UPPER_BREAK" || trend.BBStats.BBStats == "BB_LOWER_BREAK" || 
            //     trend.RSIStats.RSIStats == "BULLISH" || trend.RSIStats.RSIStats == "BEARISH_PEAK"
            // ) {
            //     trendBullishCollection.insertOne({...trend, stockSymbol: this.stockSymbol});
            // } else if (bearish > bullish) {
            //     trendBearishCollection.insertOne({...trend, stockSymbol: this.stockSymbol});
            // } else {
            //     trendNeautralCollection.insertOne({...trend, stockSymbol: this.stockSymbol});
            // }
            let rsi = trend.RSIStats.lastRSI;
            // if(trend.trend.long.slope > 0.1){
            //     trendBullishCollection.insertOne({...trend, stockSymbol: this.stockSymbol});
            // } else if(trend.trend.long.slope < -0.5) {
            //     trendBearishCollection.insertOne({...trend, stockSymbol: this.stockSymbol});
            // } else {
            //     trendNeautralCollection.insertOne({...trend, stockSymbol: this.stockSymbol});
            // }
            logger.info(`slope value : ${trend.trend.short.slope}, for stock ${this.stockSymbol}`);
            if(!this.isVerificationPossible()){
                logger.info(`verification not possible for stock ${this.stockSymbol}`);
                // const supportDetails = findSupportLevels(docs, 2*375); // Not Considered for now
                //const resistenceDetails = findResistanceLevels(docs, 2*375); // Not Considered for now
                // logger.info(`supportDetails for stock ${this.stockSymbol} supportDetails: ${supportDetails}`);
                const dynamicRSIRangeFinder = new DynamicRSIRangeFinder(14, (5*375)+15, docs, 15); // 2minutes for last 5 days
                const { top90, top95, bottom10, bottom5, nearBottom5, nearBottom10, nearTop90, nearTop95 } = dynamicRSIRangeFinder.calculate();
                if(trend.trend.short.slope > 0){
                    logger.info(`first level bullishness passed for stock ${this.stockSymbol}`);
                    // let bullishFilterScenarios = new BullishFilterScenarios(docs.slice(-2));
                    // if(!bullishFilterScenarios.isPossibleUptrend()){
                    if(nearBottom5 || nearBottom10) {
                        logger.info(`second level bullishness passed for stock ${this.stockSymbol}`);
                        trendBullishCollection.insertOne({...trend, stockSymbol: this.stockSymbol, bottom5, bottom10, top90, top95 });
                    }
                    // }
                } else if(trend.trend.short.slope < 0){
                    logger.info(`first level bearishness passed for stock ${this.stockSymbol}`);
                    // let bearishFilterScenarios = new BearishFilterScenarios(docs.slice(-2));
                    // if(!bearishFilterScenarios.isPossibleDowntrend()){
                    if(nearTop90 || nearTop95) {
                        logger.info(`second level bearishness passed for stock ${this.stockSymbol}`);
                        trendBearishCollection.insertOne({...trend, stockSymbol: this.stockSymbol, bottom5, bottom10, top90, top95 });
                    }
                    // }
                }
            } else {
                logger.info(`verification possible for stock ${this.stockSymbol}`);
                const lastCandle = await this.verify();
                const trendPosetive = lastCandle.close > lastCandle.open;
                const supportDetails = findSupportLevels(docs.slice(-22));
                if(trend.trend.short.slope <= -2 && bullish == 0){
                    logger.info(`first level bearishness passed for stock ${this.stockSymbol}`);
                    let bullishFilterScenarios = new BullishFilterScenarios(docs.slice(-2));
                    if(!bullishFilterScenarios.isPossibleUptrend()){
                        logger.info(`second level bearishness passed for stock ${this.stockSymbol}`);
                        trendBearishCollection.insertOne({...trend, stockSymbol: this.stockSymbol, supportDetails, verifyCandle: lastCandle, 
                            trendIdentification: trendPosetive ? "FAILURE": "SUCCESS"});
                    }
                }
                if(trendPosetive){
                    vTrendPosetive.insertOne({...trend, stockSymbol: this.stockSymbol, verifyCandle: lastCandle});
                } else {
                    vTrendNegetive.insertOne({...trend, stockSymbol: this.stockSymbol, verifyCandle: lastCandle});
                }
            }
            
            if (docs.length > 0) {
                await collection.insertMany(docs);
                logger.info(`Inserted ${docs.length} historical records into ${this.stockSymbol}_HIST`);
            }
        } catch (err) {
            logger.error(`HistoricalDataExecutor error: ${err.message}`);
        }
    }
}
