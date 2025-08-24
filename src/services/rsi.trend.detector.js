import { SimpleLinearRegression } from 'ml-regression-simple-linear';

export class RSITrendDetector {
    constructor(shortWindow = 5, longWindow = 14, initialValues = []) {
        this.shortWindow = shortWindow;
        this.longWindow = longWindow;
        this.RSI_MIN = 0;
        this.RSI_MAX = 100;
        this.values = initialValues.slice(); // store a copy
    }

    calculateTrend(values) {
        if (values.length < 2) return { trend: "flat", strength: "weak", slope: 0 };

        const x = Array.from({ length: values.length }, (_, i) => i);
        const y = values;

        const regression = new SimpleLinearRegression(x, y);
        const slope = regression.slope;

        // Normalize slope to RSI's 20–80 range (60 points)
        const normalizedSlope = (slope / (this.RSI_MAX - this.RSI_MIN)) * 100;
        const absSlope = Math.abs(normalizedSlope);

        let trend = "flat";
        if (normalizedSlope > 0) trend = "rising";
        else if (normalizedSlope < 0) trend = "falling";

        let strength = "weak";
        if (absSlope >= 0.5 && absSlope < 1) strength = "moderate";
        else if (absSlope >= 1) strength = "strong";

        return { trend, strength, slope: normalizedSlope };
    }

    calculateReversal(shortTrend, longTrend) {
        // Only detect if both short and long term are at least moderate
        const strongEnough = trend => ["moderate", "strong"].includes(trend.strength);

        if (shortTrend.trend === "rising" && longTrend.trend === "falling" &&
            strongEnough(shortTrend) && strongEnough(longTrend)) {
            return "possible bullish reversal";
        }

        if (shortTrend.trend === "falling" && longTrend.trend === "rising" &&
            strongEnough(shortTrend) && strongEnough(longTrend)) {
            return "possible bearish reversal";
        }

        return null;
    }

    update(newRsi) {
        if(newRsi){
            this.values.push(newRsi);
        }
        const shortTrend = this.calculateTrend(this.values.slice(-this.shortWindow));
        const longTrend = this.calculateTrend(this.values.slice(-this.longWindow));
        const reversal = this.calculateReversal(shortTrend, longTrend);

        return { short: shortTrend, long: longTrend, reversal };
    }
}


