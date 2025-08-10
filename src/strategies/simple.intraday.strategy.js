// Simple Intraday Strategy Service

export class SimpleIntradayStrategy {
    constructor() {
        // Initialize any state or config here
    }

    /**
     * Example method to decide trade action based on price and vwap
     * @param {number} price - Current price
     * @param {number} vwap - Current VWAP
     * @returns {string} - 'BUY', 'SELL', or 'HOLD'
     */
    decide(price, vwap) {
        if (price > vwap) return 'BUY';
        if (price < vwap) return 'SELL';
        return 'HOLD';
    }

    
}
