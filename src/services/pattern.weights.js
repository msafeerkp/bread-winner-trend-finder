export const PATTERN_WEIGHTS = {
  // Bearish Patterns
  bearishEngulfingPattern: 9, // Strong reversal signal, especially after an uptrend
  bearishHarami: 6, // Moderate signal; needs confirmation
  bearishHaramiCross: 7, // Slightly stronger due to doji
  eveningDojiStar: 9, // High reliability; strong reversal signal
  eveningStar: 8, // Reliable pattern after uptrend
  bearishMarubozu: 7, // Strong sentiment but trend context matters
  threeBlackCrows: 9, // Very strong bearish confirmation pattern
  bearishHammerStick: 6, // Can be ambiguous; needs confirmation
  bearishInvertedHammerStick: 7, // Indicates top; confirmation recommended
  hangingMan: 6, // Requires confirmation next candle
  hangingManUnconfirmed: 4, // Weak without confirmation
  shootingStar: 7, // Good reversal pattern with resistance
  shootingStarUnconfirmed: 5, // Less reliable without follow-through
  tweezerTop: 6, // Moderate pattern; better with other signals
  darkCloudCover: 8, // Bearish reversal pattern; strong when closing below midpoint of prior candle

  // Bullish Patterns
  bullishEngulfingPattern: 9, // Strong reversal signal; reliable in downtrend
  downsideTasukiGap: 6, // Moderate; less commonly used
  bullishHarami: 6, // Needs confirmation; medium reliability
  bullishHaramiCross: 7, // Slightly more reliable than regular Harami
  morningDojiStar: 9, // Strong bullish reversal with doji
  morningStar: 8, // Reliable in downtrend reversal
  bullishMarubozu: 7, // Strong buying sentiment; depends on context
  piercingLine: 8, // Very reliable two-candle reversal pattern
  threeWhiteSoldiers: 9, // One of the strongest bullish confirmation patterns
  bullishHammerStick: 6, // Needs confirmation; decent bottom signal
  bullishInvertedHammerStick: 7, // Good signal with follow-up confirmation
  hammerPattern: 7, // Widely recognized; strong with confirmation
  hammerPatternUnconfirmed: 5, // Weak unless confirmed
  tweezerBottom: 6 // Moderate reliability; confirmation advised
};