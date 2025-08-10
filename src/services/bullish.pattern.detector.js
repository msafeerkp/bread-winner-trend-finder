import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import technicalindicators from 'technicalindicators';

const {
    bullishengulfingpattern: isBullishEngulfing,
    downsidetasukigap: IsDownsideTasukiGap,
    bullishharami: isBullishHarami,
    bullishharamicross: isBullishHaramiCross,
    morningdojistar: isMorningDojiStar,
    morningstar: isMorningStar,
    bullishmarubozu: isBullishMarubozu,
    piercingline: isPiercingLine,
    threewhitesoldiers: isThreeWhiteSoldiers,
    bullishhammerstick: isBullishHammerStick,
    bullishinvertedhammerstick: isBullishInvertedHammer,
    hammerpattern: isBullishHammer,
    hammerpatternunconfirmed: isHammerPatternUnconfirmed,
    tweezerbottom: isTweezerBottom
} = technicalindicators;


export class BullishPatternDetector {
    /**
     * Check for all bullish candlestick patterns
     * @param {Array} candles - Array of OHLC candles (latest candle last)
     * @returns {Object} - Results of all bullish patterns
     */
    static detectAll(candles) {
        if (candles.length < 3) {
            throw new Error("At least 3 candles required for pattern detection.");
        }

        const last3 = candles.slice(-6);

        const input = {
            open: last3.map(c => c.open),
            high: last3.map(c => c.high),
            low: last3.map(c => c.low),
            close: last3.map(c => c.close),
        };

        return {
            bullishEngulfingPattern: isBullishEngulfing(input), 
            downsideTasukiGap: IsDownsideTasukiGap(input),
            bullishHarami: isBullishHarami(input),
            bullishHaramiCross: isBullishHaramiCross(input),
            morningDojiStar: isMorningDojiStar(input),
            morningStar: isMorningStar(input),
            bullishMarubozu: isBullishMarubozu(input),
            piercingLine: isPiercingLine(input),
            threeWhiteSoldiers: isThreeWhiteSoldiers(input),
            bullishHammerStick: isBullishHammerStick(input),
            bullishInvertedHammerStick: isBullishInvertedHammer(input),
            hammerPattern: isBullishHammer(input),
            hammerPatternUnconfirmed: isHammerPatternUnconfirmed(input),
            tweezerBottom: isTweezerBottom(input)
        };
    }
}
