import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

/**
 * Reads data/instruments.csv and returns the instrument_token for a given tradingsymbol.
 * @param {string} tradingsymbol
 * @returns {Promise<string|null>} instrument_token or null if not found
 */
export async function getInstrumentTokenByTradingSymbol(tradingsymbol, exchange="NSE") {
    const csvPath = path.join(process.cwd(), 'data', 'instruments.csv');
    return new Promise((resolve, reject) => {
        let found = false;
        fs.createReadStream(csvPath)
            .pipe(csv())
            .on('data', (row) => {
                if (row.tradingsymbol === tradingsymbol && (!exchange || row.exchange === exchange)) {
                    found = true;
                    resolve(row.instrument_token);
                }
            })
            .on('end', () => {
                if (!found) resolve(null);
            })
            .on('error', reject);
    });
}
