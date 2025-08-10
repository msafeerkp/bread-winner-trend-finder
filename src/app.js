import { WebSocketService } from './services/websocket.service.js';
import { HttpService } from './services/http.service.js';
import { AuthService } from './services/auth.service.js';
import { UserService } from './services/user.service.js';
import { InstrumentService } from './services/instrument.service.js';
import { LiveDataService } from './services/live.data.service.js';
import { HistoricalDataService } from './services/historical.data.service.js';
import { HistoricalDataExecutor } from './services/historical.data.executor.js';
import config from './config/config.js';
import { logger } from './utils/logger.util.js';
import * as ti from './utils/technical.indicator.cjs';
import { VWAPCalculator } from './utils/vwap.tick.util.js';
import { IntradayRSIStrategy } from './strategies/intraday.rsi.strategy.js';
import { OrderService } from './services/order.service.js';
import { RSIStrategyExecutionService } from './services/rsi.strategy.execution.service.js';
import {UiService} from './services/ui/ui.service.js';
import TickDataMongoService from './services/tick.data.mongo.service.js';
import { calculateSellPrice } from './utils/sell.price.util.js';
import IntradayMACDRSIStrategy from './strategies/intraday.macd.rsi.strategy.js';
import IntradayRSIOnlyStrategy from './strategies/intraday.rsi.only.strategy.js';
import ScalpingRSIBBStrategy from './strategies/scalping.rsi.bb.strategy.js';
import CapitalAvailabilityService from './services/capital.availability.service.js';
import IntradayShortingRSIBBStrategy from './strategies/intraday.shorting.rsi.bb.strategy.js';
import { DistributedLockService } from './services/distributed.lock.service.js';
import { StockResourceService } from './services/stock.resource.service.js';
import { TrendFinderService } from './services/trend.finder.service.js';
import { FilteredStockListWriter } from './services/filtered.stock.list.writer.js';


const httpService = new HttpService();

async function loginAndFetchAccessToken() {
    const authService = new AuthService();
    logger.info('Initiating login process...');
    const accessToken = await authService.login();
    logger.info('Login successful! Access token obtained.');
    return accessToken;
}

async function printProfile(accessToken) {
    const userService = new UserService(accessToken);
    const profile = await userService.getProfile();
    logger.info(`User profile fetched for: ${profile.user_shortname}`);
}

async function main(clientId, accessToken) {
    logger.info('Starting Auto-Trade Console Application...');
    try {

        const accessToken = await loginAndFetchAccessToken();
        // Print user profile
        await printProfile(accessToken);
        // download instruments
        const instrumentService = new InstrumentService(accessToken);
        await instrumentService.downloadInstruments(); 

        const trendFinder = new TrendFinderService(accessToken);
        await trendFinder.init();
        await trendFinder.insertHistoricalData();

        const writer = new FilteredStockListWriter({ timePeriod: 180, outputFile: 'stock_list.json' });
        await writer.writeFilteredList();

        process.exit();


    } catch (error) {
        logger.error(`Application error: ${error.message}`);
        process.exit(1);
    }
}

main();