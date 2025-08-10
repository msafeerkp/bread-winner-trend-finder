import { IntradayRSIStrategy } from '../strategies/intraday.rsi.strategy.js';
import { OrderService } from './order.service.js';
import { logger } from '../utils/logger.util.js';
// import uiService from './ui.service.js';
import { DrawLineChartService } from './draw.line.chart.service.js';

class RSIStrategyExecutionService {
    constructor(liveDataService, accessToken, stockSymbol) {
        this.liveDataService = liveDataService;
        this.accessToken = accessToken;
        this.stockSymbol = stockSymbol;
        // this.wss = uiService.start(4000, this.stockSymbol, this.liveDataService);
        // this.drawLineChartService = new DrawLineChartService(this.wss);
    }

    async placeOrder() {
        const orderService = new OrderService(this.accessToken);
        try {
            const orderParams = {
                tradingsymbol: 'ICICIBANK',
                exchange: 'NSE',
                transaction_type: 'BUY',
                order_type: 'MARKET',
                quantity: 1,
                product: 'CNC',
                validity: 'DAY'
            };
            const orderId = await orderService.placeOrder(orderParams, 'amo');
            logger.info(`Order placed! Order ID: ${orderId}`);
        } catch (orderErr) {
            logger.error(`Order placement failed: ${orderErr.message}`);
        }
    }

    async recieveRSISignal(signal, rsi, price, packet) {
        if(rsi) {
            this.drawLineChartService.sendData({ 
                label: new Date().toISOString().split('T')[1], data: {rsi, price} 
            });
        }
        
        if (signal === "BUY") {
            logger.info(`RSI Signal: ${signal} at price ${price} with RSI ${rsi}`);
            // await this.placeOrder();
        } else {
            logger.info(`No signal at price ${price} with RSI ${rsi}`);
        }
    }

    async execute() {
        let rsiStrategy = new IntradayRSIStrategy({
            liveDataService: this.liveDataService,
            overbought: 70,
            oversold: 30,
            period: 600,
            stockSymbol: this.stockSymbol
        });
        await rsiStrategy.run(this.recieveRSISignal.bind(this));
    }
}

export { RSIStrategyExecutionService };