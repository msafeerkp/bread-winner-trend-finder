import config from '../config/config.js';
import { HttpService } from './http.service.js';
import { logger } from '../utils/logger.util.js';

export class PositionService {
    constructor(accessToken) {
        this.httpService = new HttpService(accessToken);
    }

    /**
     * Fetches the current positions for the given stock symbol.
     * @param {string} stockSymbol - The stock symbol to fetch positions for.
     * @returns {quantity, average_price} - Returns the positions data is available otherwise returns null.
     */
    async getCurrentPosition(stockSymbol) {
        try {
            const url = `${config.kite.apiUrl}/portfolio/positions`;
            const response = await this.httpService.get(url);

            if (response.status === 'success' && response.data && response.data.net) {
                const positions = response.data.net;
                const position = positions.find(pos => pos.tradingsymbol === stockSymbol);
                if (position) {
                    return {
                        quantity: position.quantity,
                        buyPrice: position?.buy_price,
                        sellPrice: position?.sell_price,
                    };
                }
            }
            return null;
        } catch (error) {
            logger.error(`Error fetching positions for ${stockSymbol}: ${error.message}`);
            throw error;
        }
    }
}   