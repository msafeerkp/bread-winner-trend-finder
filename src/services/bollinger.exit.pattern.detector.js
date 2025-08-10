// bollinger.exit.pattern.detector.js
// ES module: Detects pattern for Bollinger Band exit signal with skip logic

import { logger } from '../utils/logger.util.js';

/**
 * @typedef {Object} Candle
 * @property {number} open - Opening price
 * @property {number} high - High price
 * @property {number} low - Low price
 * @property {number} close - Closing price
 */

export class BollingerExitPatternDetector {
  constructor() {
    this.logger = logger;
    this.reset();
  }

  /**
   * Reset the pattern detection state
   */
  reset() {
    this.state = 'WAITING_FIRST_ABOVE'; // WAITING_FIRST_ABOVE
    this.patternHistory = [];
  }

  /**
   * Process a new candle and Bollinger band values
   * @param {Candle} candle - Candle object with open, high, low, close
   * @param {number} lowerBand - Lower Bollinger band value
   * @param {number} middleBand - Middle Bollinger band value
   * @param {number} upperBand - Upper Bollinger band value
   * @returns {Object} { shouldExit: boolean, reason: string, patternComplete: boolean }
   */
  processCandle(candle, lowerBand, middleBand, upperBand) {
    const closePrice = candle.close;
    const isAboveMiddle = closePrice > middleBand;

    // Add to history for debugging
    this.patternHistory.push({
      close: closePrice,
      middle: middleBand,
      isAbove: isAboveMiddle,
      state: this.state
    });
    if (this.patternHistory.length > 10) {
      this.patternHistory.shift();
    }

    let shouldExit = false;
    let reason = '';
    let patternComplete = false;

    // Immediately exit if close is above middle band
    if (isAboveMiddle) {
      this.logger.info(`Exit Signal: Close ${closePrice} above middle ${middleBand}`);
      shouldExit = true;
      patternComplete = true;
      reason = 'Exit: Close above middle band';
      this.reset();
    }

    return {
      shouldExit,
      reason,
      patternComplete,
      currentState: this.state,
      closePrice,
      middleBand,
      isAboveMiddle,
      patternHistory: [...this.patternHistory]
    };
  }

  /**
   * Get current state information
   * @returns {Object} Current detector state
   */
  getState() {
    return {
      currentState: this.state,
      historyLength: this.patternHistory.length
    };
  }

  /**
   * Check if pattern is in progress
   * @returns {boolean} True if pattern detection is active
   */
  isPatternInProgress() {
    return this.state !== 'WAITING_FIRST_ABOVE';
  }
}

// Example usage:
// const detector = new BollingerExitPatternDetector();
// for each incoming candle:
// const result = detector.processCandle(candle, lowerBand, middleBand, upperBand);
// if (result.shouldExit) {
//   console.log(`EXIT SIGNAL: ${result.reason}`);
// }
