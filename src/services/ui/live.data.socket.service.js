import { logger } from '../../utils/logger.util.js';

export class LiveDataSocketService {
    constructor(candlePeriod) {
        this.candlePeriod = candlePeriod; // e.g., '5', '10'
        this.lastTradedPrices = [];
        this.volume = 0;
        this.candles = null;
    }
    formCandle(packet) {
        if(this.lastTradedPrices.length === this.candlePeriod) {
            let candleToSend = {
            timestamp: packet.timestamp,
            open: this.lastTradedPrices[0],
            high: Math.max(...this.lastTradedPrices),
            low: Math.min(...this.lastTradedPrices),
            close: packet.last_traded_price,
            volume: packet.last_traded_quantity + this.volume
            };
            this.lastTradedPrices = [];
            this.volume = 0;
            this.candles = null;
            return candleToSend;
        } else {
            this.lastTradedPrices.push(packet.last_traded_price);
            this.volume += packet.last_traded_quantity;
            return null; // Not enough data to form a candle yet
        }
    }
}

export default LiveDataSocketService;
