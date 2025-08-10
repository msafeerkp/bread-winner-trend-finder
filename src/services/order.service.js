import config from '../config/config.js';
import { HttpService } from './http.service.js';
import { logger } from '../utils/logger.util.js';

function toUrlEncoded(obj) {
    return Object.entries(obj)
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
        .join('&');
}

export class OrderService {
    constructor(accessToken) {
        this.httpService = new HttpService(accessToken);
    }

    /**
     * Place an order using Kite API
     * @param {Object} orderParams - Order parameters (tradingsymbol, exchange, transaction_type, order_type, quantity, product, validity, etc.)
     * @param {string} [variety='regular'] - Order variety (e.g., 'regular', 'amo', 'co', etc.)
     * @returns {Promise<string>} - Returns order_id on success
     */
    async placeOrder(orderParams, variety = 'regular') {
        try {
            logger.info(`Placing order for ${orderParams.tradingsymbol} (${orderParams.transaction_type})`);
            const url = `${config.kite.apiUrl}/orders/${variety}`;
            const data = toUrlEncoded(orderParams);
            const response = await this.httpService.post(url, data, {
                headers: {
                    'X-Kite-Version': '3',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            if (response.status === 'success' && response.data && response.data.order_id) {
                logger.info(`Order placed successfully. Order ID: ${response.data.order_id}`);
                return response.data.order_id;
            }
            throw new Error('Failed to place order');
        } catch (error) {
            logger.error(`Error placing order: ${error.message}`);
            throw error;
        }
    }
}
