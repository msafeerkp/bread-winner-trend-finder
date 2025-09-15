// supportFinder.js
export function findSupportLevels(candles, lookback = 20, threshold = 0.02) {
  // candles: [{ open, high, low, close }]
  if (candles.length < lookback) {
    throw new Error("Not enough data");
  }

  const supports = [];

  // find local minima within the lookback period
  for (let i = 1; i < lookback - 1; i++) {
    const prev = candles[i - 1].low;
    const curr = candles[i].low;
    const next = candles[i + 1].low;

    // local minima condition
    if (curr < prev && curr < next) {
      supports.push(curr);
    }
  }

  // take last candle
  const lastCandle = candles[candles.length - 1];
  const currentPrice = lastCandle.close;

  // check if current price is near any support
  const crucialSupport = supports.find(support => {
    return Math.abs(currentPrice - support) / support <= threshold;
  });

  return {
    currentPrice,
    supports,
    atSupport: crucialSupport !== undefined,
    crucialSupport
  };
}

// candles: array of objects sorted by time (ascending)
// each candle: { open, high, low, close }

export function findResistanceLevels(candles, lookback = 5, tolerance = 0.5) {
  let resistanceLevels = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isLocalHigh = true;
    let currentHigh = candles[i].high;

    // check if current high is the highest in the neighborhood
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (candles[j].high > currentHigh) {
        isLocalHigh = false;
        break;
      }
    }

    if (isLocalHigh) {
      // Check if a similar level already exists (within tolerance)
      let existing = resistanceLevels.find(
        (lvl) => Math.abs(lvl - currentHigh) <= tolerance
      );
      if (!existing) resistanceLevels.push(currentHigh);
    }
  }

  // sort resistance levels
  resistanceLevels.sort((a, b) => a - b);

  return resistanceLevels;
}



