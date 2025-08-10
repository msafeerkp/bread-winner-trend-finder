import http from 'http';
import { logger } from '../../utils/logger.util.js';
import { HistoricalDataRestService } from './historical.data.rest.service.js';
import WebSocket, { WebSocketServer } from 'ws';
import { LiveDataService } from '../live.data.service.js';
import { timeStamp } from 'console';
import LiveDataSocketService from './live.data.socket.service.js';
import { LiveRSICalculator } from '../../utils/rsi.tick.util.js';
import { MACD, BollingerBands, EMA } from 'technicalindicators';
import { getDB, getMongoClient } from '../../utils/mongodb.util.js';
import TradeDetailsService from '../trade.details.service.js';

export class UiService {
    constructor(accessToken, wsService, liveCandlePeriod = 5) {
        this.accessToken = accessToken;
        this.wsService = wsService;
        this.liveDataSocketService = new LiveDataSocketService(liveCandlePeriod);
        // const stockSymbol = 'FEDERALBNK'; // You can change this or loop through config.stockSymbols
    }
    onMessage(packet) {
        if(this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Send the live data packet to the WebSocket client
            let newPacket = {...packet, timestamp: new Date()};
            let candle = this.liveDataSocketService.formCandle(newPacket);
            if(candle){
                this.ws.send(JSON.stringify(candle));
                logger.info(`Candle Send : ${JSON.stringify(candle)}`);
            }
            
        }
    };
    start(port = 5000) {
        const server = http.createServer(async (req, res) => {
            // Enable CORS for all responses
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            // Handle preflight OPTIONS request
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            // /api/historical-rsi/:symbol
            if (req.url.startsWith('/api/historical-rsi/')) {
                const symbol = req.url.split('/').pop();
                try {
                    const data = await HistoricalDataRestService.getHistoricalRSI(symbol);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(data));
                } catch (err) {
                    logger.error(`Historical RSI REST error: ${err.message}`);
                    res.writeHead(500, { 'Content-Type': 'application/json' }); // <-- fixed here
                    res.end(JSON.stringify({ error: err.message }));
                }
                return;
            }

            // /api/historical-candles/:symbol
            if (req.url.startsWith('/api/historical-candles/')) {
                const symbol = req.url.split('/').pop();
                try {
                    const data = await HistoricalDataRestService.getHistoricalCandles(symbol);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(data));
                } catch (err) {
                    logger.error(`Historical Candles REST error: ${err.message}`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
                return;
            }

            // /api/historical-macd/:symbol
            if (req.url.startsWith('/api/historical-macd/')) {
                const symbol = req.url.split('/').pop();
                try {
                    const data = await HistoricalDataRestService.getHistoricalMACD(symbol);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(data));
                } catch (err) {
                    logger.error(`Historical MACD REST error: ${err.message}`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
                return;
            }

            // /api/trade-details?symbol=STOCK&date=YYYY-MM-DD
            if (req.url.startsWith('/api/trade-details')) {
                const urlObj = new URL(req.url, `http://${req.headers.host}`);
                const stockSymbol = urlObj.searchParams.get('symbol');
                const date = urlObj.searchParams.get('date');
                if (!stockSymbol || !date) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing symbol or date parameter' }));
                    return;
                }
                try {
                    const tradeDetailsService = new TradeDetailsService();
                    const data = await tradeDetailsService.getTradeDetails(stockSymbol, date);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(data));
                } catch (err) {
                    logger.error(`Trade Details REST error: ${err.message}`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
                return;
            }

            // Default response
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        });

        // Create WebSocket server in noServer mode
        const wss = new WebSocketServer({ noServer: true });

        // Handle WebSocket upgrade for /ws/live-candles-rsi-macd/:symbol
        server.on('upgrade', (request, socket, head) => {
            const url = request.url || '';
            if (url.startsWith('/ws/live-candles-rsi-macd/')) {
                wss.handleUpgrade(request, socket, head, (ws) => {
                    wss.emit('connection', ws, request);
                });
            } else {
                socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
                socket.destroy();
            }
        });

        wss.on('connection', async (ws, req) => {
            const url = req.url || '';
            const stockSymbol = url.split('/').pop();

            if (url.startsWith('/ws/live-candles-rsi-macd/')) {
                // Poll MongoDB for new ticks and form candle/RSI/MACD/BollingerBands
                const rsiCalc = new LiveRSICalculator(14, stockSymbol);
                const macdPeriod = { fast: 12, slow: 26, signal: 9 };
                let macdCloses = [];
                let bbCloses = [];
                let wsOpen = true;
                ws.on('close', () => { wsOpen = false; });
                ws.on('error', error => { console.error('WebSocket error:', error); });

                await getMongoClient();
                const db = getDB();
                const collection = db.collection(`${stockSymbol}_tick`);
                let lastTimestamp = null;

                // Poll every second for new ticks
                const pollInterval = setInterval(async () => {
                    if (!wsOpen) {
                        clearInterval(pollInterval);
                        return;
                    }
                    let query = {};
                    if (lastTimestamp) {
                        query = { timestamp: { $gt: lastTimestamp } };
                    }
                    const newTicks = await collection.find(query).sort({ timestamp: 1 }).toArray();
                    for (const packet of newTicks) {
                        lastTimestamp = packet.timestamp;
                        let candle = this.liveDataSocketService.formCandle(packet);
                        if (candle && ws.readyState === WebSocket.OPEN) {
                            // RSI
                            const rsi = rsiCalc.nextValue(candle.close);

                            // MACD
                            macdCloses.push(candle.close);
                            let macd = null;
                            if (macdCloses.length >= macdPeriod.slow) {
                                const macdArr = MACD.calculate({
                                    values: macdCloses,
                                    fastPeriod: macdPeriod.fast,
                                    slowPeriod: macdPeriod.slow,
                                    signalPeriod: macdPeriod.signal,
                                    SimpleMAOscillator: false,
                                    SimpleMASignal: false
                                });
                                if (macdArr.length > 0) {
                                    macd = macdArr[macdArr.length - 1];
                                }
                            }

                            // Bollinger Bands
                            bbCloses.push(candle.close);
                            let bb = null;
                            if (bbCloses.length >= 20) {
                                const bbArr = BollingerBands.calculate({
                                    period: 20,
                                    stdDev: 2,
                                    values: bbCloses
                                });
                                if (bbArr.length > 0) {
                                    bb = bbArr[bbArr.length - 1];
                                }
                            }
                            let ema9 = null, ema21 = null;
                            if (bbCloses.length >= 21) {
                                ema9 = EMA.calculate({ period: 9, values: bbCloses }).slice(-1)[0];
                                ema21 = EMA.calculate({ period: 21, values: bbCloses }).slice(-1)[0];
                            }
                            let emaStrategy = null;
                            if(ema9 && ema21 && bb) {
                                emaStrategy = {
                                    upper : ema9,
                                    lower : ema21,
                                    middle: bb.middle
                                };
                            }

                            if (rsi !== null && macd != null && macd.histogram != null && bb != null) {
                                ws.send(JSON.stringify({
                                    candle,
                                    rsi,
                                    macd,
                                    bollingerBand: bb,
                                    // bollingerBand: emaStrategy,
                                    timestamp: candle.timestamp || new Date()
                                }));
                            }
                        }
                    }
                }, 1000);
            } else {
                ws.close();
            }
        });

        server.listen(port, () => {
            logger.info(`Simple API server started on port ${port}`);
        });

        server.on('error', (error) => {
            logger.error(`UI service error: ${error.message}`);
        });

        return server;
    }
}

export default UiService;
