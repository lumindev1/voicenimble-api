import 'dotenv/config';
import app from './app';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { startWorkers } from './jobs/workers';
import { VoiceNimbleService } from './services/voicenimble.service';
import logger from './utils/logger';

const PORT = process.env.PORT || 3001;

async function registerSpeechCredentials() {
  if (!process.env.ELEVENLABS_API_KEY) return;
  try {
    const voiceNimble = new VoiceNimbleService();
    const sid = await voiceNimble.addElevenLabsSpeechCredential();
    logger.info(`ElevenLabs speech credential registered: ${sid}`);
  } catch (error) {
    logger.warn('Failed to register ElevenLabs speech credential:', error);
  }
}

async function bootstrap() {
  try {
    await connectDatabase();
    await connectRedis();
    await startWorkers();
    await registerSpeechCredentials();

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
