import { Router, Request, Response } from 'express';
import axios from 'axios';
import { VoiceNimbleWebhookController } from '../controllers/voicenimble-webhook.controller';
import logger from '../utils/logger';

const router = Router();
const controller = new VoiceNimbleWebhookController();

// Main call entry point (called when a new call arrives)
router.post('/call-event', controller.handleCallEvent);

// Call status updates
router.post('/call-status', controller.handleCallStatus);

// Speech recognition result (from gather verb)
router.post('/gather-result', controller.handleGatherResult);

// Recording completed
router.post('/recording-status', controller.handleRecordingStatus);

// Transfer webhook
router.post('/transfer-webhook', controller.handleTransfer);

// ElevenLabs TTS proxy — play verb fetches audio from here
router.get('/tts/elevenlabs', async (req: Request, res: Response) => {
  const text = req.query.text as string;
  const voice = (req.query.voice as string) || 'EXAVITQu4vr4xnSDxMaL';
  if (!text) { res.status(400).send('Missing text'); return; }

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
      {
        headers: { 'xi-api-key': apiKey!, 'Content-Type': 'application/json' },
        responseType: 'stream',
      },
    );

    res.set('Content-Type', 'audio/mpeg');
    response.data.pipe(res);
  } catch (err) {
    logger.error(`ElevenLabs TTS proxy error: ${err}`);
    res.status(500).send('TTS failed');
  }
});

export default router;
