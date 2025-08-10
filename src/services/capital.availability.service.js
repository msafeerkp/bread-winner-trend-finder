import { getDB, getMongoClient } from '../utils/mongodb.util.js';
import { logger } from '../utils/logger.util.js';

export class CapitalAvailabilityService {
    constructor(totalCapitalAvailable, distributedLock, clientId) {
        this.totalCapitalAvailable = totalCapitalAvailable;
        this.collectionName = `capital_availability_${clientId}`;
        this.docId = 'capital_state';
        this.distributedLock = distributedLock;
        this.clientId = clientId;
    }

    async ensureMongoReady() {
        await getMongoClient();
    }

    async start() {
        await this.ensureMongoReady();
        const db = getDB("capital_management");
        const collection = db.collection(this.collectionName);
        await collection.updateOne(
            { _id: this.docId },
            { $set: { capital: this.totalCapitalAvailable } },
            { upsert: true }
        );
        logger.info(`[CapitalAvailability] Initialized capital: ${this.totalCapitalAvailable}`);
        await this.distributedLock.connect();
    }

    async deductCapital(deductValue) {
        let lockToken = null;
        try{
            lockToken = await this.distributedLock.acquireLock(`capital_${this.clientId}`, 30);
            await this.ensureMongoReady();
            const db = getDB("capital_management");
            const collection = db.collection(this.collectionName);
            const state = await collection.findOne({ _id: this.docId });
            let newCapital = (state?.capital || 0) - deductValue;
            if (newCapital < 0) newCapital = 0;
            await collection.updateOne(
                { _id: this.docId },
                { $set: { capital: newCapital } },
                { upsert: true }
            );
            logger.info(`[CapitalAvailability] Capital updated. Deducted: ${deductValue}, New Capital: ${newCapital}`);
            return newCapital;
        } finally{
            if(lockToken){
                logger.info(`[CapitalAvailability] [deductCapital] releasing the lock.`);
                await this.distributedLock.releaseLock(`capital_${this.clientId}`, lockToken);
            }
        }
        
    }

    async addCapital(addValue) {
        let lockToken = null;
        try{
            lockToken = await this.distributedLock.acquireLock(`capital_${this.clientId}`, 30);
            await this.ensureMongoReady();
            const db = getDB("capital_management");
            const collection = db.collection(this.collectionName);
            const state = await collection.findOne({ _id: this.docId });
            let newCapital = (state?.capital || 0) + addValue;
            if (newCapital < 0) newCapital = 0;
            await collection.updateOne(
                { _id: this.docId },
                { $set: { capital: newCapital } },
                { upsert: true }
            );
            logger.info(`[CapitalAvailability] Capital updated. added: ${addValue}, New Capital: ${newCapital}`);
            return newCapital;
        } finally{
            if(lockToken){
                await this.distributedLock.releaseLock(`capital_${this.clientId}`, lockToken);
            }
        }
        
    }

    async checkCapitalAvailability(requiredValue) {
        let lockToken = null;
        try{
            lockToken = await this.distributedLock.acquireLock(`capital_${this.clientId}`, 30);
            await this.ensureMongoReady();
            const db = getDB("capital_management");
            const collection = db.collection(this.collectionName);
            const state = await collection.findOne({ _id: this.docId });
            const available = (state?.capital || 0) >= requiredValue;
            logger.info(`[CapitalAvailability] Check: Required=${requiredValue}, Available=${state?.capital || 0}, Result=${available}`);
            return available;
        } finally{
            if(lockToken){
                await this.distributedLock.releaseLock(`capital_${this.clientId}`, lockToken);
            }
        }

        
    }
}

export default CapitalAvailabilityService;
