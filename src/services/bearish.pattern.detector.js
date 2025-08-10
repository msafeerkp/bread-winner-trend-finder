import { createRequire } from 'module';
const require = createRequire(import.meta.url);

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

        const last3 = candles.slice(-6);

        const input = {
            open: last3.map(c => c.open),
            high: last3.map(c => c.high),
            low: last3.map(c => c.low),
            close: last3.map(c => c.close),
        };

        return {
            bearishEngulfingPattern: isBearishEngulfing(input),
            bearishHarami: isBearishHarami(input),
            bearishHaramiCross: isBearishHaramiCross(input),
            eveningDojiStar: isEveningDojiStar(input),
            eveningStar: isEveningStar(input),
            bearishMarubozu: isBearishMarubozu(input),
            threeBlackCrows: isThreeBlackCrows(input),
            bearishHammerStick: isBearishHammer(input),
            bearishInvertedHammerStick: isBearishInvertedHammer(input),
            hangingMan: IsHangingMan(input),
            hangingManUnconfirmed: IsHangingManUnconfirmed(input),
            shootingStar: IsShootingStar(input),
            shootingStarUnconfirmed:IsShootingStarUnconfirmed(input),
            tweezerTop: isTweezerTop(input),
            darkCloudCover: isDarkCloudCover(input),
        };
    }
}

// Example Usage
const candles = [
    { open: 58, high: 60, low: 46, close: 55 },
    { open: 55, high: 57, low: 52, close: 56 },
    { open: 56, high: 57, low: 45, close: 46 },
];

const results = BearishPatternDetector.detectAll(candles);
console.log(results);
