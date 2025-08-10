import { logger } from '../utils/logger.util.js';

/**
 * BollingerBandShrinkingDetectorService
 * Detects if Bollinger Band is shrinking on each candle.
 * Returns true if band width shrinks, false otherwise.
 */
export class BollingerBandShrinkingDetectorService {
    constructor() {
        this.previousWidth = null;
    }

    /**
     * Checks if Bollinger Band is shrinking.
     * @param {Object} band - { upper: number, lower: number, middle: number }
     * @param {Object} candle - { close: number }
     * @returns {boolean} - true if shrinking, false otherwise
     */
    detectShrinkage(band, candle) {
        const { upper, lower, middle } = band;
        const { close } = candle;
        const width = upper - lower;
        let isShrinking = false;
        if (this.previousWidth !== null) {
            if (width < this.previousWidth) {
                isShrinking = true;
            }
        }
        logger.info(`Candle Close: ${close}, Bollinger Band - Upper: ${upper}, Middle: ${middle}, Lower: ${lower}, Width: ${width.toFixed(6)}, Shrinking: ${isShrinking}`);
        this.previousWidth = width;
        return isShrinking;
    }

    /**
     * Resets the internal previous width state.
     */
    reset() {
        this.previousWidth = null;
    }

}
