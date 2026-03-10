import { Queue } from 'bullmq';

// BullMQ bundles its own ioredis — pass connection options directly (not a shared client)
function getBullMQConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    connection: {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      db: parseInt(parsed.pathname?.replace('/', '') || '0', 10) || 0,
    },
  };
}

export const analyticsQueue = new Queue('analytics', getBullMQConnection());
export const emailQueue = new Queue('email', getBullMQConnection());
export const reportQueue = new Queue('report', getBullMQConnection());
export const broadcastQueue = new Queue('broadcast', getBullMQConnection());
