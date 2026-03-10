import { Redis } from 'ioredis';
import logger from '../utils/logger';

let redisClient: Redis;

export function connectRedis(): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(url, {
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
      resolve();
    });

    redisClient.on('error', (err) => {
      logger.error('Redis error:', err);
      reject(err);
    });
  });
}

export function getRedisClient(): Redis {
  if (!redisClient) throw new Error('Redis not initialized. Call connectRedis() first.');
  return redisClient;
}

export default redisClient!;
