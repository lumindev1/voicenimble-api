import { Router } from 'express';
import { CallController } from '../controllers/call.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new CallController();

router.use(authenticate);

router.get('/', controller.getCalls);
router.post('/outbound', controller.makeOutboundCall);
router.get('/:callId', controller.getCall);
router.get('/:callId/transcript', controller.getTranscript);
router.get('/:callId/recording', controller.getRecordingUrl);

export default router;
