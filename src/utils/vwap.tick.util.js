// Maintains running VWAP for streaming tick data

export class VWAPCalculator {
    constructor() {
        this.cumPV = 0;    // Cumulative price * volume
        this.cumVol = 0;   // Cumulative volume
    }

    /**
     * Update VWAP with a new tick.
     * @param {number} price - The trade price (e.g., last traded price)
     * @param {number} volume - The trade volume for this tick
     * @returns {number} - The current VWAP
     */
    update(price, volume) {
        this.cumPV += price * volume;
        this.cumVol += volume;
        return this.getVWAP();
    }

    /**
     * Get the current VWAP value.
     * @returns {number}
     */
    getVWAP() {
        if (this.cumVol === 0) return 0;
        return this.cumPV / this.cumVol;
    }
}
