const { VWAP } = require('technicalindicators');

/**
 * Calculate VWAP (Volume Weighted Average Price) using technicalindicators.
 * @param {Array<Object>} data - Array of objects with {high, low, close, volume}
 * @returns {Array<number>} - VWAP values for the input data
 */
function calculateVWAP(data) {
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Input data must be a non-empty array');
    }

    const high = data.map(d => d.high);
    const low = data.map(d => d.low);
    const close = data.map(d => d.close);
    const volume = data.map(d => d.volume);

    return VWAP.calculate({ high, low, close, volume });
}

module.exports = { calculateVWAP };