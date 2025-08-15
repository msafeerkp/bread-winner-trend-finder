import { HistoricalDataService } from './historical.data.service.js';
import { getDB, getMongoClient } from '../utils/mongodb.util.js';
import { logger } from '../utils/logger.util.js';
import { StockTrendAnalyzer } from './stock.trend.analyzer.js';
import { PATTERN_WEIGHTS } from './pattern.weights.js';

export class HistoricalDataExecutor {
    constructor(accessToken, stockSymbol, interval= 'day', intervalType, numDays) {
        this.accessToken = accessToken;
        this.stockSymbol = stockSymbol;
        this.numDays = numDays;
        this.historicalService = new HistoricalDataService(accessToken, stockSymbol);
        this.mongoReady = false;
        this.interval = interval;
        this.intervalType= intervalType;
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
        bullish?.length && bullish?.forEach(pattern => {
            scores.bullish += PATTERN_WEIGHTS[pattern] || 0;
        });

        bearish?.length && bearish?.forEach(pattern => {
            scores.bearish += PATTERN_WEIGHTS[pattern] || 0;
        });

        return scores;
    }

    async execute() {

        // Get today's date in YYYY-MM-DD format
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayString = `${year}-${month}-${day}`;

        const now = new Date();
        // Subtract numDays * 24 * 60 * 60 * 1000 milliseconds from current time (includes time, not just date). plus 2 is added to avoid weekend
        const fromDate = new Date(now.getTime() - (this.numDays + 2) * 24 * 60 * 60 * 1000);

        // Format: 'YYYY-MM-DD HH:mm:ss'
        function formatDateTime(dt) {
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

        const to = formatDateTime(now);
        const from = formatDateTime(fromDate);

        try {
            const candles = await this.historicalService.fetchHistoricalData({
                interval: `${this.interval == 1 ? '' : this.interval}${this.intervalType}`,
                from,
                to
            });
            logger.info(`Fetched ${candles.length} historical candles for ${this.stockSymbol}`);

            await this.ensureMongoReady();
            const db = getDB(`trend_finder_${this.interval == 1 ? '' : this.interval}${this.intervalType}_${todayString}`);
            const collection = db.collection(`${this.stockSymbol}_HIST`);
            const trendBearishCollection = db.collection(`trend_bearish`);
            const trendBullishCollection = db.collection(`trend_bullish`);
            const trendNeautralCollection = db.collection(`trend_neautral`);
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
            if (bullish > bearish || 
                trend.BBStats.BBStats == "BB_UPPER_BREAK" || trend.BBStats.BBStats == "BB_LOWER_BREAK" || 
                trend.RSIStats.RSIStats == "BULLISH" || trend.RSIStats.RSIStats == "BEARISH_PEAK"
            ) {
                trendBullishCollection.insertOne({...trend, stockSymbol: this.stockSymbol});
            } else if (bearish > bullish) {
                trendBearishCollection.insertOne({...trend, stockSymbol: this.stockSymbol});
            } else {
                trendNeautralCollection.insertOne({...trend, stockSymbol: this.stockSymbol});
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
