import { Router } from 'express';
import { JambonzWebhookController } from '../controllers/jambonz-webhook.controller';

const router = Router();
const controller = new JambonzWebhookController();

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

export default router;
