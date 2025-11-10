// filtered.stock.list.writer.js
// Reads stock symbols from two MongoDB collections and writes a filtered list to a JSON file.
// Usage: node filtered.stock.list.writer.js [--timePeriod=180] [--output=filtered_stocks.json]

import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import config from '../config/config.js';

export class FilteredStockListWriter {
  constructor({ timePeriod = 180, outputFile = 'filtered_stocks.json', priceMaxThreshold = 500, priceMinThreshold = 25, dbName } = {}) {
    this.mongoUrl = 'mongodb://localhost:27017';
    this.dbName = dbName;
    this.collections = ['trend_bullish'];
    this.timePeriod = timePeriod;
    this.outputFile = outputFile;
    this.client = new MongoClient(this.mongoUrl);
    this.priceMaxThreshold = priceMaxThreshold;
    this.priceMinThreshold = priceMinThreshold;
    
  }

  async getStockDetails(collectionName) {
    const db = this.client.db(this.dbName);
    const stockDetails = [];
    const docs = await db.collection(collectionName).find({}).toArray();
    docs.forEach(doc => {
      if (doc.stockSymbol) {
        stockDetails.push({ symbol: doc.stockSymbol, bottom5: doc.bottom5, bottom10: doc.bottom10, top90: doc.top90, top95: doc.top95, timePeriod: this.timePeriod });
      }
    });
    return stockDetails;
  }

  async filterAbovePriceThreshold(symbols) {
    const db = this.client.db(this.dbName);
    const stocksFilteredByPrice = [];
    for(const symbol of symbols){
      const doc = await db.collection(`${symbol}_HIST`).findOne({}, { sort: { timestamp: -1 }, projection: { close: 1 }, });
      if(doc.close <= this.priceMaxThreshold && doc.close > this.priceMinThreshold){
        stocksFilteredByPrice.push(symbol);
      }
    }
    console.log(`Filtered stock list actual: ${symbols.length}, final list : ${stocksFilteredByPrice.length}`);
    return stocksFilteredByPrice;
  }

  async writeFilteredList() {
    try {
      await this.client.connect();
      const bullishStocks = await this.getStockDetails('trend_bullish');
      const bearishStocks = await this.getStockDetails('trend_bearish');
      // symbols = await this.filterAbovePriceThreshold(symbols);
      // const result = stocks.map(stock => ({ ...stock, timePeriod: this.timePeriod }));
      const trendingOutPath = config.customFilePath?.length ? path.resolve(config.customFilePath, "trending.stocks.json") : path.resolve(process.cwd(), this.outputFile);
      fs.writeFileSync(trendingOutPath, JSON.stringify(bullishStocks, null, 2));
      console.log(`Trending stock list written to ${trendingOutPath}`);
      const fallingOutPath = config.customFilePath?.length ? path.resolve(config.customFilePath, "falling.stocks.json") : path.resolve(process.cwd(), this.outputFile);
      fs.writeFileSync(fallingOutPath, JSON.stringify(bearishStocks, null, 2));
      console.log(`Falling stock list written to ${fallingOutPath}`);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    } finally {
      await this.client.close();
    }
  }
  
}
