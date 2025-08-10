import { getInstrumentTokenByTradingSymbol } from '../utils/instrument.util.js';
import { HttpService } from './http.service.js';
import config from '../config/config.js';
import { logger } from '../utils/logger.util.js';

class HistoricalDataService {
    constructor(accessToken, stockSymbol) {
        this.accessToken = accessToken;
        this.stockSymbol = stockSymbol;
        this.instrumentToken = null;
        this.httpService = new HttpService(accessToken);
    }

    async getInstrumentToken() {
        if (!this.instrumentToken) {
            this.instrumentToken = await getInstrumentTokenByTradingSymbol(this.stockSymbol, 'NSE');
        }
        return this.instrumentToken;
    }

    /**
     * Fetch historical data for the given stock symbol.
     * @param {Object} options - { interval, from, to, continuous, oi }
     * @returns {Promise<Array>} - Array of historical candles
     */
    async fetchHistoricalData(options) {
        const instrumentToken = await this.getInstrumentToken();
        if (!instrumentToken) {
            throw new Error(`Instrument token not found for symbol: ${this.stockSymbol}`);
        }

        // Example: interval = '5minute', from = '2024-06-01 09:15:00', to = '2024-06-27 15:30:00'
        const {
            interval = '5minute',
            from,
            to,
            continuous = false,
            oi = false
        } = options;

        const url = `${config.kite.apiUrl}/instruments/historical/${instrumentToken}/${interval}`;
        const params = {
            from,
            to,
            continuous,
            oi
        };

        try {
            const response = await this.httpService.get(url, { params });
            if (response && response.data && response.data.candles) {
                logger.info(`Fetched ${response.data.candles.length} candles for ${this.stockSymbol}`);
                return response.data.candles;
            }
            throw new Error('No historical data found');
        } catch (err) {
            logger.error(`Error fetching historical data: ${err.message}`);
            throw err;
        }
    }
}

export { HistoricalDataService };
