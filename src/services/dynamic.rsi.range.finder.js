import { RSI } from "technicalindicators";
import {logger} from "../utils/logger.util.js";

export class DynamicRSIRangeFinder {
    constructor(rsiPeriod, lookbackBars = 375+15, candles, tolerance) {
        this.rsiPeriod = rsiPeriod;
        this.lookbackBars = lookbackBars;
        this.candles = candles;
        this.tolerance = tolerance;
    }

    percentile(arr, p) {
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.floor((p / 100) * sorted.length);
        return sorted[idx];
    }

    calculate(){
        const closes = this.candles.map(candle => candle.close);
        const rsiValues = RSI.calculate({ period: this.rsiPeriod, values: closes });
        const result = this.candles.slice(this.rsiPeriod).map((d, i) => ({
            time: d.time,
            close: d.close,
            rsi: rsiValues[i]
        }));
        const recentRSI = result.slice(-this.lookbackBars).map(r => r.rsi);
        const top90 = this.percentile(recentRSI, 90).toFixed(2);
        const top95 = this.percentile(recentRSI, 95).toFixed(2);
        const bottom10 = Number(this.percentile(recentRSI, 10).toFixed(2));
        const bottom5 = Number(this.percentile(recentRSI, 5).toFixed(2));
        logger.info(`Dynamic RSI Shorting Levels: 10th Percentile (soft bottom): ${bottom10}, 5th Percentile (strong bottom): ${bottom5}`);
          // Current RSI
        const currentRSI = result[result.length - 1].rsi;

        // Check if current RSI is nearing oversold
        const nearBottom10 = currentRSI <= (bottom10 + this.tolerance);
        const nearBottom5 = currentRSI <= (bottom5 + this.tolerance);

        logger.info(`Dynamic RSI near bottom + tolerence: ${bottom10 + this.tolerance}, currentRSI : ${currentRSI}`);

        return { top90, top95, bottom5, bottom10, nearBottom10, nearBottom5 };
    }
}
