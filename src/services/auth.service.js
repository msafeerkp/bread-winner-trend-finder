import open from 'open';
import { HttpService } from './http.service.js';
import { generateChecksum } from '../utils/crypto.util.js';
import config from '../config/config.js';
import http from 'http';
import url from 'url';
import { logger } from '../utils/logger.util.js';
import { getAvailablePort } from '../utils/port.util.js';

export class AuthService {
    constructor() {
        this.httpService = new HttpService();
        this.accessToken = null;
    }

    async login() {
        return new Promise(async (resolve, reject) => {
            const port = await getAvailablePort();
            // Create temporary server to handle redirect
            const server = http.createServer(async (req, res) => {
                const queryParams = url.parse(req.url, true).query;
                const requestToken = queryParams.request_token;

                if (requestToken) {
                    logger.info(`Received request token: ${requestToken}`);
                    try {
                        const accessToken = await this.getAccessToken(requestToken);
                        logger.info('Access token obtained successfully');
                        res.end('Login successful! You can close this window.');
                        server.close();
                        resolve(accessToken);
                    } catch (error) {
                        logger.error(`Login failed: ${error.message}`);
                        reject(error);
                    }
                }
            });

            server.listen(port, () => {
                const loginUrl = `${config.kite.loginUrl}?v=3&api_key=${config.kite.apiKey}`;
                logger.info(`Local server started on port ${port}`);
                open(loginUrl);
            });

            server.on('error', (error) => {
                logger.error(`Server error: ${error.message}`);
                reject(error);
            });
        });
    }

    async getAccessToken(requestToken) {
        logger.info('Exchanging request token for access token...');
        const checksum = generateChecksum(
            config.kite.apiKey,
            requestToken,
            config.kite.apiSecret
        );

        try {
            const response = await this.httpService.post(
                `${config.kite.apiUrl}/session/token`,
                {
                    api_key: config.kite.apiKey,
                    request_token: requestToken,
                    checksum: checksum
                },
                true // Set isFormData to true
            );

            if (response.status === 'success') {
                logger.info('Access token exchange successful');
                this.accessToken = response.data.access_token;
                return this.accessToken;
            }
            throw new Error('Token exchange failed');
        } catch (error) {
            logger.error(`Access token exchange failed: ${error.message}`);
            throw error;
        }
    }
}
