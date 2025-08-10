import axios from 'axios';
import config from '../config/config.js';
import { logger } from '../utils/logger.util.js';

export class HttpService {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.client = axios.create({
            timeout: 10000
        });

        this.client.interceptors.response.use(
            response => response.data,
            error => {
                logger.error(`HTTP Error: ${error.response?.data || error.message}`);
                throw error;
            }
        );
    }

    getHeaders(isFormData = false) {
        const headers = {
            'X-Kite-Version': '3'
        };

        if (this.accessToken) {
            headers['Authorization'] = `token ${config.kite.apiKey}:${this.accessToken}`;
        }

        if (isFormData) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
        } else {
            headers['Content-Type'] = 'application/json';
        }

        return headers;
    }

    async get(url, options = {}) {
        try {
            const response = await this.client.get(url, {
                headers: this.getHeaders(),
                ...options
            });
            return response;
        } catch (error) {
            logger.error(`GET request failed: ${url}`);
            throw error;
        }
    }

    async post(url, data, isFormData = false) {
        try {
            const formData = isFormData ? new URLSearchParams(data) : data;
            return await this.client.post(url, formData, {
                headers: this.getHeaders(isFormData)
            });
        } catch (error) {
            logger.error(`POST request failed: ${url}`);
            throw error;
        }
    }
}
