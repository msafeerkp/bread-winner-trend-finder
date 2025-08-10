function isDoji(candle, bodyThreshold = 0.1) {
    const bodySize = Math.abs(candle.open - candle.close);
    const range = candle.high - candle.low;
    return bodySize <= range * bodyThreshold; // Body < 10% of total range
}
function isSpinningTop(candle, bodyThreshold = 0.2, wickThreshold = 0.3) {
    const bodySize = Math.abs(candle.open - candle.close);
    const range = candle.high - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    return (
        bodySize <= range * bodyThreshold && // Small body
        upperWick >= range * wickThreshold && // Significant upper wick
        lowerWick >= range * wickThreshold   // Significant lower wick
    );
}
function isHaramiCross(candles) {
    const [prev, current] = candles.slice(-2);
    return (
        isDoji(current) &&
        current.high < prev.high &&
        current.low > prev.low
    );
}
function isHighWave(candle, bodyThreshold = 0.1) {
    const bodySize = Math.abs(candle.open - candle.close);
    const range = candle.high - candle.low;
    return bodySize <= range * bodyThreshold;
}
function isInsideBar(candles) {
    const [prev, current] = candles.slice(-2);
    return (
        current.high <= prev.high &&
        current.low >= prev.low
    );
}
export class NeutralPatternDetector {
    static detectAll(candles) {
        if (candles.length < 2) throw new Error("Need at least 2 candles.");
        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        return {
            // Single-candle patterns
            doji: isDoji(current),
            spinningTop: isSpinningTop(current),
            highWave: isHighWave(current),

            // Two-candle patterns
            haramiCross: isHaramiCross(candles),
            insideBar: isInsideBar(candles),
        };
    }
}

// Example Usage
const candles = [
    { open: 50, high: 55, low: 45, close: 52 }, // Bullish candle
    { open: 51, high: 53, low: 49, close: 51 },  // Doji (neutral)
];

const results = NeutralPatternDetector.detectAll(candles);
console.log(results);