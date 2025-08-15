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

function getCandles(candles, requiredCount){
    const last3 = candles.slice(requiredCount);
    const input = {
        open: last3.map(c => c.open),
        high: last3.map(c => c.high),
        low: last3.map(c => c.low),
        close: last3.map(c => c.close),
    };
    return input;
}

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

        // const last3 = candles.slice(-6);

        // const input = {
        //     open: last3.map(c => c.open),
        //     high: last3.map(c => c.high),
        //     low: last3.map(c => c.low),
        //     close: last3.map(c => c.close),
        // };

        return {
            bullishEngulfingPattern: isBullishEngulfing(getCandles(candles, -2)), 
            downsideTasukiGap: IsDownsideTasukiGap(getCandles(candles, -3)),
            bullishHarami: isBullishHarami(getCandles(candles, -2)),
            bullishHaramiCross: isBullishHaramiCross(getCandles(candles, -2)),
            morningDojiStar: isMorningDojiStar(getCandles(candles, -3)),
            morningStar: isMorningStar(getCandles(candles, -3)),
            bullishMarubozu: isBullishMarubozu(getCandles(candles, -1)),
            piercingLine: isPiercingLine(getCandles(candles, -2)),
            threeWhiteSoldiers: isThreeWhiteSoldiers(getCandles(candles, -3)),
            bullishHammerStick: isBullishHammerStick(getCandles(candles, -1)),
            bullishInvertedHammerStick: isBullishInvertedHammer(getCandles(candles, -1)),
            hammerPattern: isBullishHammer(getCandles(candles, -5)),
            hammerPatternUnconfirmed: isHammerPatternUnconfirmed(getCandles(candles, -5)),
            tweezerBottom: isTweezerBottom(getCandles(candles, -5))
        };
    }
}
