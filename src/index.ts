import 'dotenv/config';
import app from './app';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { startWorkers } from './jobs/workers';
import logger from './utils/logger';

const PORT = process.env.PORT || 3001;

async function bootstrap() {
  try {
    await connectDatabase();
    await connectRedis();
    await startWorkers();

    app.listen(PORT, () => {
      logger.info(`Voice Nimble API running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
