// bollinger.pattern.detector.js
// ES module: Pattern detection for Bollinger Band crossovers with skip logic

import { logger } from '../utils/logger.util.js';

/**
 * @typedef {Object} Candle
 * @property {number} open - Opening price
 * @property {number} high - High price
 * @property {number} low - Low price
 * @property {number} close - Closing price
 */

export class BollingerPatternDetector {
  constructor() {
    this.logger = logger;
    this.reset();
  }

  /**
   * Reset the pattern detection state
   */
  reset() {
    this.state = 'WAITING_FIRST_ABOVE'; // States: WAITING_FIRST_ABOVE, SKIP_AFTER_ABOVE, WAITING_BELOW, SKIP_AFTER_BELOW, WAITING_SECOND_ABOVE, WAITING_CONFIRMATION
    this.skipCount = 0;
    this.patternHistory = [];
  }

  /**
   * Process a new candle and Bollinger band values
   * @param {Candle} candle - Candle object with open, high, low, close
   * @param {number} upperBand - Upper Bollinger band value
   * @param {number} middleBand - Middle Bollinger band value  
   * @param {number} lowerBand - Lower Bollinger band value
   * @returns {Object} { shouldExit: boolean, reason: string, patternComplete: boolean }
   */
  processCandle(candle, upperBand, middleBand, lowerBand) {
    const closePrice = candle.close;
    const isAboveMiddle = closePrice > middleBand;
    const isBelowMiddle = closePrice < middleBand;
    
    // Add to history for debugging
    this.patternHistory.push({
      close: closePrice,
      middle: middleBand,
      isAbove: isAboveMiddle,
      state: this.state,
      skipCount: this.skipCount
    });

    // Keep only last 10 entries for memory efficiency
    if (this.patternHistory.length > 10) {
      this.patternHistory.shift();
    }

    let shouldExit = false;
    let reason = '';
    let patternComplete = false;

    switch (this.state) {
      case 'WAITING_FIRST_ABOVE':
        if (isAboveMiddle) {
          this.logger.info(`📈 Pattern Step 1: Close ${closePrice} above middle ${middleBand}`);
          this.state = 'SKIP_AFTER_ABOVE';
          this.skipCount = 0;
        }
        break;

      case 'SKIP_AFTER_ABOVE':
        this.skipCount++;
        this.logger.info(`⏭️ Skipping candle ${this.skipCount} after first above`);
        if (this.skipCount >= 1) {
          this.state = 'WAITING_BELOW';
          this.skipCount = 0;
        }
        break;

      case 'WAITING_BELOW':
        if (isBelowMiddle) {
          this.logger.info(`📉 Pattern Step 2: Close ${closePrice} below middle ${middleBand}`);
          this.state = 'SKIP_AFTER_BELOW';
          this.skipCount = 0;
        }
        break;

      case 'SKIP_AFTER_BELOW':
        this.skipCount++;
        this.logger.info(`⏭️ Skipping candle ${this.skipCount} after below`);
        if (this.skipCount >= 1) {
          this.state = 'WAITING_SECOND_ABOVE';
          this.skipCount = 0;
        }
        break;

      case 'WAITING_SECOND_ABOVE':
        if (isAboveMiddle) {
          this.logger.info(`📈 Pattern Step 3: Close ${closePrice} above middle ${middleBand} - Waiting for confirmation`);
          this.state = 'WAITING_CONFIRMATION';
        }
        break;

      case 'WAITING_CONFIRMATION':
        if (isAboveMiddle) {
          this.logger.info(`🚨 Pattern Complete! Confirmation candle ${closePrice} also above middle ${middleBand} - EXIT SIGNAL`);
          shouldExit = true;
          patternComplete = true;
          reason = 'Bollinger pattern confirmed: Above → Skip → Below → Skip → Above → Above (confirmed)';
          this.reset(); // Reset for next pattern
        }
        break;
    }

    return {
      shouldExit,
      reason,
      patternComplete,
      currentState: this.state,
      closePrice,
      middleBand,
      isAboveMiddle,
      patternHistory: [...this.patternHistory] // Return copy for debugging
    };
  }

  /**
   * Get current state information
   * @returns {Object} Current detector state
   */
  getState() {
    return {
      currentState: this.state,
      skipCount: this.skipCount,
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
// const detector = new BollingerPatternDetector();
// 
// // For each incoming candle
// const result = detector.processCandle(candle, upperBand, middleBand, lowerBand);
// 
// if (result.shouldExit) {
//   console.log(`EXIT SIGNAL: ${result.reason}`);
//   // Execute exit logic here
// }
//
// console.log(`Current state: ${result.currentState}`);
