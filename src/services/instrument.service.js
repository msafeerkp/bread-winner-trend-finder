import fs from 'fs';
import path from 'path';
import { HttpService } from './http.service.js';
import config from '../config/config.js';
import { logger } from '../utils/logger.util.js';

export class InstrumentService {
    constructor(accessToken) {
        this.httpService = new HttpService(accessToken);
        this.dataDir = path.join(process.cwd(), 'data');
        this.ensureDataDirectory();
        logger.info('Instrument service initialized');
    }

    ensureDataDirectory() {
        if (!fs.existsSync(this.dataDir)) {
            logger.info(`Creating data directory: ${this.dataDir}`);
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    async downloadInstruments() {
        const instrumentsFile = path.join(this.dataDir, 'instruments.csv');
        logger.info('Starting instruments download...');

        try {
            const response = await this.httpService.client({
                method: 'GET',
                url: `${config.kite.apiUrl}/instruments`,
                // responseType: 'arraybuffer',  // Changed to handle binary data
                headers: {
                    'X-Kite-Version': '3',
                    'Authorization': `token ${config.kite.apiKey}:${this.httpService.accessToken}`
                }
            });

            if (response) {
                logger.info('Writing instruments data to file...');
                fs.writeFileSync(instrumentsFile, response);
                logger.info(`Instruments CSV saved to: ${instrumentsFile}`);
                return instrumentsFile;
            }
            throw new Error('Failed to download instruments: Empty response');
        } catch (error) {
            logger.error(`Error downloading instruments: ${error.message}`);
            throw error;
        }
    }
}