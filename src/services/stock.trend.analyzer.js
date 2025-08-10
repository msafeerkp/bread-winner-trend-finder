// StockTrendAnalyzer.js
import { EMA, MACD, RSI, BollingerBands } from 'technicalindicators';
import { BullishPatternDetector } from './bullish.pattern.detector.js';
import { BearishPatternDetector } from './bearish.pattern.detector.js';
import { NeutralPatternDetector } from './neutral.pattern.detector.js';

export class StockTrendAnalyzer {
  constructor(candles) {
    this.candles = candles; // Array of { open, high, low, close, volume }
    this.close = candles.map(c => c.close);
    this.open = candles.map(c => c.open);
    this.high = candles.map(c => c.high);
    this.low = candles.map(c => c.low);
    this.volume = candles.map(c => c.volume);
  }

  getLast(arr) {
    return arr?.length > 0 ? arr[arr.length - 1] : null;
  }

  getAverageVolume(period = 20) {
    const recent = this.volume.slice(-period);
    const sum = recent.reduce((acc, val) => acc + val, 0);
    return sum / period;
  }

  detectEngulfing() {
    if (this.candles.length < 2) return null;
    const prev = this.candles[this.candles.length - 2];
    const curr = this.candles[this.candles.length - 1];

    const bullish = prev.close < prev.open && curr.close > curr.open && curr.close > prev.open && curr.open < prev.close;
    const bearish = prev.close > prev.open && curr.close < curr.open && curr.close < prev.open && curr.open > prev.close;

    return bullish ? 'Bullish Engulfing' : bearish ? 'Bearish Engulfing' : null;
  }

  filterTrueValues(obj) {
    return Object.fromEntries(
        Object.entries(obj).filter(([key, value]) => value === true)
    );
  }

  getTrueKeys(obj) {
    return Object.keys(obj).filter(key => obj[key] === true);
  } 

  analyze() {
    const ema50 = EMA.calculate({ period: 50, values: this.close });
    const ema200 = EMA.calculate({ period: 200, values: this.close });
    const macd = MACD.calculate({
      values: this.close,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    const rsi = RSI.calculate({ period: 14, values: this.close });
    const bb = BollingerBands.calculate({ values: this.close, period: 20, stdDev: 2 });

    const lastClose = this.getLast(this.close);
    const lastVolume = this.getLast(this.volume);
    const avgVolume = this.getAverageVolume();
    const lastEMA50 = this.getLast(ema50);
    const lastEMA200 = this.getLast(ema200);
    const lastMACD = this.getLast(macd);
    const lastRSI = this.getLast(rsi);
    const lastBB = this.getLast(bb);

    const reasons = [];

    if (lastClose > lastEMA50) reasons.push('Close > EMA50');
    if (lastClose > lastEMA200) reasons.push('Close > EMA200');
    if (lastMACD && lastMACD.MACD > lastMACD.signal) reasons.push('MACD bullish crossover');
    if (lastRSI > 50) reasons.push('RSI > 50');
    if (lastVolume > avgVolume * 1.5) reasons.push('Volume spike');

    const pattern = this.detectEngulfing();
    if (pattern) reasons.push(`Pattern detected: ${pattern}`);

    if (lastBB) {
      if (lastClose > lastBB.upper) reasons.push('Breakout Above Upper Band');
      else if (lastClose < lastBB.lower) reasons.push('Breakdown Below Lower Band');
    }

    // Score to determine trend
    const bullishScore = reasons.filter(r =>
      r.includes('EMA') || r.includes('MACD') || r.includes('RSI >') || r.includes('Bullish')
    ).length;

    const bearishScore = reasons.filter(r =>
      r.includes('Breakdown') || r.includes('Bearish') || r.includes('RSI <') || r.includes('MACD bearish')
    ).length;

    const trend = bullishScore >= 3 ? 'Bullish'
      : bearishScore >= 3 ? 'Bearish'
      : 'Neutral';

    // const bullishDetector = new BullishPatternDetector();
    const bPatterns = BullishPatternDetector.detectAll(this.candles);
    const bullish = this.getTrueKeys(bPatterns);

    // const bearishDetector = new BearishPatternDetector();
    const bearPatterns = BearishPatternDetector.detectAll(this.candles);
    const bearish = this.getTrueKeys(bearPatterns);

    // // const neautralDetector = new NeutralPatternDetector();
    // const neatrualPatterns = NeutralPatternDetector.detectAll(this.candles);
    // const neatrual = this.getTrueKeys(neatrualPatterns);
    return {
      bullish,
      bearish,
      //neatrual
    };
  }
}
