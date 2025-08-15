import technicalindicators from 'technicalindicators';

const {
    bearishengulfingpattern: isBearishEngulfing,
    bearishharami: isBearishHarami,
    bearishharamicross: isBearishHaramiCross,
    eveningdojistar: isEveningDojiStar,
    eveningstar: isEveningStar,
    bearishmarubozu: isBearishMarubozu,
    threeblackcrows: isThreeBlackCrows,
    bearishhammerstick: isBearishHammer,
    bearishinvertedhammerstick: isBearishInvertedHammer,
    hangingman: IsHangingMan,
    hangingmanunconfirmed: IsHangingManUnconfirmed,
    shootingstar: IsShootingStar,
    shootingstarunconfirmed: IsShootingStarUnconfirmed,
    tweezertop: isTweezerTop,
    darkcloudcover: isDarkCloudCover,
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

export class BearishPatternDetector {
    /**
     * Check for all bearish candlestick patterns
     * @param {Array} candles - Array of OHLC candles (latest candle last)
     * @returns {Object} - Results of all bearish patterns
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
            bearishEngulfingPattern: isBearishEngulfing(getCandles(candles, -2)),
            bearishHarami: isBearishHarami(getCandles(candles, -2)),
            bearishHaramiCross: isBearishHaramiCross(getCandles(candles, -2)),
            eveningDojiStar: isEveningDojiStar(getCandles(candles, -3)),
            eveningStar: isEveningStar(getCandles(candles, -3)),
            bearishMarubozu: isBearishMarubozu(getCandles(candles, -1)),
            threeBlackCrows: isThreeBlackCrows(getCandles(candles, -3)),
            bearishHammerStick: isBearishHammer(getCandles(candles, -1)),
            bearishInvertedHammerStick: isBearishInvertedHammer(getCandles(candles, -1)),
            hangingMan: IsHangingMan(getCandles(candles, -5)),
            hangingManUnconfirmed: IsHangingManUnconfirmed(getCandles(candles, -5)),
            shootingStar: IsShootingStar(getCandles(candles, -5)),
            shootingStarUnconfirmed:IsShootingStarUnconfirmed(getCandles(candles, -5)),
            tweezerTop: isTweezerTop(getCandles(candles, -5)),
            darkCloudCover: isDarkCloudCover(getCandles(candles, -2)),
        };
    }
}
