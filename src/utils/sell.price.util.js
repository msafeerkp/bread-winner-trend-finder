/**
 * Returns the tick size for a given price.
 * @param {number} price
 * @returns {number}
 */
function getTickSize(price) {
    if (price < 250) return 0.01;
    if (price >= 251 && price <= 1000) return 0.05;
    if (price >= 1001 && price <= 5000) return 0.10;
    return 0.10;
}

/**
 * Rounds the value to the nearest valid tick size.
 * @param {number} value
 * @param {number} tickSize
 * @returns {number}
 */
function roundToTick(value, tickSize) {
    return Math.round(value / tickSize) * tickSize;
}

/**
 * Calculates the sell price based on buy price and profit percentage,
 * rounded to the nearest valid tick size.
 * @param {number} buyPrice
 * @param {number} profitPercent
 * @returns {number}
 */
export function calculateSellPrice(buyPrice, profitPercent) {
    const rawSell = buyPrice * (1 + profitPercent / 100);
    const tickSize = getTickSize(rawSell);
    const sellPrice = roundToTick(rawSell, tickSize);
    return Number(sellPrice.toFixed(2));
}

// Example usage:
if (import.meta.url === process.argv[1]) {
    const buyPrice = 218.79;
    const profitPercent = 0.1965;
    const sellPrice = calculateSellPrice(buyPrice, profitPercent);
    console.log(`Sell price for buy price ₹${buyPrice} and profit ${profitPercent}%: ₹${sellPrice}`);
}
