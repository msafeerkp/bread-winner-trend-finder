import crypto from 'crypto';

export const generateChecksum = (apiKey, requestToken, apiSecret) => {
    const message = apiKey + requestToken + apiSecret;
    return crypto.createHash('sha256').update(message).digest('hex');
};
