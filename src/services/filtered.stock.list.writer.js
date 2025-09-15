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
    this.collections = ['trend_bullish'];
    this.timePeriod = timePeriod;
    this.outputFile = outputFile;
    this.client = new MongoClient(this.mongoUrl);
    this.priceMaxThreshold = priceMaxThreshold;
    this.priceMinThreshold = priceMinThreshold;
    
  }

  async getStockDetails() {
    const db = this.client.db(this.dbName);
    // const symbolSet = new Set();
    const stockDetails = [];
    for (const col of this.collections) {
      const docs = await db.collection(col).find({}, { projection: { stockSymbol: 1,  bottom10: 1 } }).toArray();
      docs.forEach(doc => {
        if (doc.stockSymbol) {
          stockDetails.push({symbol: doc.stockSymbol, bottom10: doc.bottom10, timePeriod: this.timePeriod})
        }
      });
      // stockDetails.push(docs)
    }
    return stockDetails;
    // return Array.from(symbolSet);
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
      let result = await this.getStockDetails();
      // symbols = await this.filterAbovePriceThreshold(symbols);
      // const result = stocks.map(stock => ({ ...stock, timePeriod: this.timePeriod }));
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
