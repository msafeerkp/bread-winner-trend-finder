// filtered.stock.list.writer.js
// Reads stock symbols from two MongoDB collections and writes a filtered list to a JSON file.
// Usage: node filtered.stock.list.writer.js [--timePeriod=180] [--output=filtered_stocks.json]

import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

export class FilteredStockListWriter {
  constructor({ timePeriod = 180, outputFile = 'filtered_stocks.json', priceMaxThreshold = 500, priceMinThreshold = 25, dbName } = {}) {
    this.mongoUrl = 'mongodb://localhost:27017';
    this.dbName = dbName;
    this.collections = ['trend_neautral', 'trend_bearish'];
    this.timePeriod = timePeriod;
    this.outputFile = outputFile;
    this.client = new MongoClient(this.mongoUrl);
    this.priceMaxThreshold = priceMaxThreshold;
    this.priceMinThreshold = priceMinThreshold;
    
  }

  async getStockSymbols() {
    const db = this.client.db(this.dbName);
    const symbolSet = new Set();
    for (const col of this.collections) {
      const docs = await db.collection(col).find({}, { projection: { stockSymbol: 1 } }).toArray();
      docs.forEach(doc => {
        if (doc.stockSymbol) symbolSet.add(doc.stockSymbol);
      });
    }
    return Array.from(symbolSet);
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
      let symbols = await this.getStockSymbols();
      symbols = await this.filterAbovePriceThreshold(symbols);
      const result = symbols.map(symbol => ({ symbol, timePeriod: this.timePeriod }));
      const outputPath = path.resolve(process.cwd(), this.outputFile);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`Filtered stock list written to ${outputPath}`);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    } finally {
      await this.client.close();
    }
  }
  
}
