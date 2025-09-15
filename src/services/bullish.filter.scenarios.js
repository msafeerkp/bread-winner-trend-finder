import { logger } from "../utils/logger.util.js";

// gapBigCandle.js
export class BullishFilterScenarios {
  constructor(candles = [], bigCandleMultiplier = 1.5) {
    // candles: [{ open, high, low, close }]
    // must always be 2 candles in ascending order
    this.candles = candles;
    this.bigCandleMultiplier = bigCandleMultiplier;
  }

  addCandle(candle) {
    this.candles.push(candle);
    if (this.candles.length > 2) {
      this.candles.shift(); // keep only last 2
    }
  }

  // Check if last candle is bullish gap up
  isGapUp() {
    if (this.candles.length < 2) return false;
    const prev = this.candles[0];
    const curr = this.candles[1];

    const result = curr.open > prev.close && curr.close > curr.open;
    logger.info(`isGapUp ? ${result}`);
    return result;
  }

  // Check if last candle is big bullish
  isBigBullish() {
    if (this.candles.length < 2) return false;
    const prev = this.candles[0];
    const curr = this.candles[1];

    const bodies = [
      Math.abs(prev.close - prev.open),
      Math.abs(curr.close - curr.open),
    ];
    const avgBody = (bodies[0] + bodies[1]) / 2;
    const threshold = avgBody * this.bigCandleMultiplier;

    const result = curr.close > curr.open && (curr.close - curr.open) >= threshold;
    logger.info(`isBigBullish ? ${result}`);
    return result;
  }

  // Uptrend possibility if both conditions true
  isPossibleUptrend() {
    return this.isGapUp() || this.isBigBullish();
  }
}
