import WebSocket from 'ws';
import config from '../config/config.js';
import { logger } from '../utils/logger.util.js';

export class WebSocketService {
    constructor(accessToken) {
        this.apiKey = config.kite.apiKey;
        this.accessToken = accessToken;
        this.ws = null;
        // Map instrumentToken -> array of callbacks
        this.messageListeners = new Map();
    }

    connect() {
        return new Promise((resolve, reject) => {
            const wsUrl = `wss://ws.kite.trade?api_key=${this.apiKey}&access_token=${this.accessToken}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => {
                logger.info('WebSocket connection established');
                resolve();
            });

            this.ws.on('message', (data) => {
                let packets = [];
                if (Buffer.isBuffer(data)) {
                    packets = this.parseBinaryMessage(data);
                    packets.forEach(packet => {
                        // logger.info(`Quote: ${JSON.stringify(packet)}`);
                        // Notify listeners for this instrument_token
                        const listeners = this.messageListeners.get(packet.instrument_token);
                        if (listeners && listeners.length) {
                            listeners.forEach(cb => cb(packet));
                        }
                    });
                } else {
                    logger.info(`WebSocket message: ${data.toString()}`);
                }
            });

            this.ws.on('error', (error) => {
                logger.error(`WebSocket error: ${error.message}`);
                reject(error);
            });

            this.ws.on('close', () => {
                logger.info('WebSocket connection closed');
            });
        });
    }

    subscribe(instrumentTokens) {
        const message = { a: "subscribe", v: instrumentTokens };
        this.ws.send(JSON.stringify(message));
        logger.info(`Subscribed to instruments: ${instrumentTokens.join(', ')}`);
    }

    setMode(mode, instrumentTokens) {
        const message = { a: "mode", v: [mode, instrumentTokens] };
        this.ws.send(JSON.stringify(message));
        logger.info(`Set mode "${mode}" for instruments: ${instrumentTokens.join(', ')}`);
    }

    /**
     * Register a callback to receive parsed quote packets for a specific instrument token.
     * @param {number} instrumentToken
     * @param {(packet: Object) => void} cb
     */
    onMessage(instrumentToken, cb) {
        if (!this.messageListeners.has(instrumentToken)) {
            this.messageListeners.set(instrumentToken, []);
        }
        this.messageListeners.get(instrumentToken).push(cb);
    }

    parseBinaryMessage(buffer) {
        let offset = 0;
        const packets = [];
        if (buffer.length < 2) return packets;
        const numPackets = buffer.readUInt16BE(offset);
        offset += 2;
        for (let i = 0; i < numPackets; i++) {
            if (offset + 2 > buffer.length) break;
            const packetLength = buffer.readUInt16BE(offset);
            offset += 2;
            if (offset + packetLength > buffer.length) break;
            const packetBuffer = buffer.slice(offset, offset + packetLength);
            packets.push(this.parseQuotePacket(packetBuffer));
            offset += packetLength;
        }
        return packets;
    }

    parseQuotePacket(buffer) {
        const instrument_token = buffer.readInt32BE(0);
        const last_traded_price = buffer.readInt32BE(4) / 100;
        const last_traded_quantity = buffer.readInt32BE(8);
        const avg_traded_price = buffer.readInt32BE(12) / 100;
        const volume = buffer.readInt32BE(16);
        const buy_qty = buffer.readInt32BE(20);
        const sell_qty = buffer.readInt32BE(24);
        const open = buffer.readInt32BE(28) / 100;
        const high = buffer.readInt32BE(32) / 100;
        const low = buffer.readInt32BE(36) / 100;
        const close = buffer.readInt32BE(40) / 100;
        const timestamp = buffer.readInt32BE(44) * 1000; // Convert to milliseconds
        // Add more fields as needed for 'full' mode

        return {
            instrument_token,
            last_traded_price,
            last_traded_quantity,
            avg_traded_price,
            volume,
            buy_qty,
            sell_qty,
            open,
            high,
            low,
            close,
            timestamp: new Date(timestamp)
        };
    }
}
