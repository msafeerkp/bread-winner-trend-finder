import { createClient } from 'redis';
import { randomBytes } from 'crypto';
import { logger } from '../utils/logger.util.js';

export class DistributedLockService {
  constructor() {
    this.client = createClient({
      host: 'localhost',
      port: 6379,
    });
    
    this.client.on('error', (err) => {
      logger.error('[DistributedLockService] Redis Client Error: ' + err.message);
    });
    
    this.client.on('connect', () => {
      logger.info('[DistributedLockService] Connected to Redis');
    });
  }

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async disconnect() {
    if (this.client.isOpen) {
      await this.client.disconnect();
    }
  }

  /**
   * Acquire a distributed lock
   * @param {string} lockKey - The key for the lock
   * @param {number} ttlSeconds - Time to live for the lock in seconds (default: 30)
   * @returns {Promise<string|null>} - Returns lock token if successful, null if failed
   */
  async acquireLock(lockKey, ttlSeconds = 30) {
    const lockToken = randomBytes(16).toString('hex');
    const lockValue = `${process.pid}:${Date.now()}:${lockToken}`;
    
    try {
      // Use SET with NX (only if not exists) and EX (expiration) options
      const result = await this.client.set(lockKey, lockValue, {
        NX: true, // Only set if key doesn't exist
        EX: ttlSeconds // Set expiration time in seconds
      });
      
      if (result === 'OK') {
        logger.info('[DistributedLockService] 🔒 Lock acquired: ' + lockKey + ' by process ' + process.pid + ' (token: ' + lockToken + ')');
        return lockToken;
      }
      
    } catch (error) {
      logger.error('[DistributedLockService] Error acquiring lock ' + lockKey + ': ' + error.message);
    }
    
    logger.error('[DistributedLockService] ❌ Failed to acquire lock: ' + lockKey);
    return null;
  }

  /**
   * Release a distributed lock
   * @param {string} lockKey - The key for the lock
   * @param {string} lockToken - The token returned when the lock was acquired
   * @returns {Promise<boolean>} - Returns true if successfully released, false otherwise
   */
  async releaseLock(lockKey, lockToken) {
    const lockValue = await this.client.get(lockKey);
    
    if (!lockValue) {
      logger.info('[DistributedLockService] ⚠️  Lock ' + lockKey + ' does not exist or has already expired');
      return false;
    }
    
    // Check if the lock belongs to this process/token
    if (lockValue.includes(lockToken)) {
      try {
        // Use Lua script to ensure atomic check and delete
        const luaScript = `
          if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
          else
            return 0
          end
        `;
        
        const result = await this.client.eval(luaScript, {
          keys: [lockKey],
          arguments: [lockValue]
        });
        
        if (result === 1) {
          logger.info('[DistributedLockService] 🔓 Lock released: ' + lockKey + ' by process ' + process.pid + ' (token: ' + lockToken + ')');
          return true;
        } else {
          logger.info('[DistributedLockService] ⚠️  Lock ' + lockKey + ' was not owned by this token');
          return false;
        }
      } catch (error) {
        logger.error('[DistributedLockService] Error releasing lock ' + lockKey + ': ' + error.message);
        return false;
      }
    } else {
      logger.info('[DistributedLockService] ⚠️  Lock ' + lockKey + ' is owned by a different process/token');
      return false;
    }
  }
}
