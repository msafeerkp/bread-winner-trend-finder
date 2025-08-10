import { LiveRSICalculator } from '../utils/rsi.tick.util.js';

class IntradayRSIStrategy {
    /**
     * @param {object} params
     * @param {LiveDataService} params.liveDataService - Instance of LiveDataService
     * @param {number} params.overbought - RSI value above which to signal SELL
     * @param {number} params.oversold - RSI value below which to signal BUY
     * @param {number} [params.period=5] - RSI period (default 5)
     */
    constructor({ liveDataService, overbought, oversold, period = 5, stockSymbol }) {
        this.liveDataService = liveDataService;
        this.overbought = overbought;
        this.oversold = oversold;
        this.rsiCalc = new LiveRSICalculator(period, stockSymbol);
    }

    /**
     * Subscribe to live data and process RSI signals.
     * @param {(signal: 'BUY'|'SELL'|null, rsi: number|null, price: number) => void} onSignal
     */
    async run(onSignal) {
        await this.liveDataService.subscribeToLiveData((packet) => {
            const price = packet.last_traded_price;
            const rsi = this.rsiCalc.nextValue(price);
            let signal = null;
            if (rsi !== undefined && rsi !== null) {
                if (rsi > this.overbought) signal = 'SELL';
                else if (rsi < this.oversold) signal = 'BUY';
            }
            onSignal(signal, rsi, price, packet);
        });
    }

    getRSI() {
        return this.rsiCalc.getRSI();
    }
}

export { IntradayRSIStrategy };