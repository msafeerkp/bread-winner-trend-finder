import config from '../config/config.js';
import { HttpService } from './http.service.js';
import { logger } from '../utils/logger.util.js';

export class UserService {
    constructor(accessToken) {
        this.httpService = new HttpService(accessToken);
    }

    async getProfile() {
        try {
            logger.info('Fetching user profile...');
            const response = await this.httpService.get(`${config.kite.apiUrl}/user/profile`);
            if (response.status === 'success') {
                logger.info(`Profile fetched successfully for user: ${response.data.user_name}`);
                return response.data;
            }
            throw new Error('Failed to fetch user profile');
        } catch (error) {
            logger.error(`Error fetching user profile: ${error.message}`);
            throw error;
        }
    }
}
