import { Router } from 'express';
import { BroadcastController } from '../controllers/broadcast.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new BroadcastController();

router.use(authenticate);

router.get('/', controller.getAll);
router.post('/', controller.create);
router.get('/:broadcastId', controller.getOne);
router.delete('/:broadcastId', controller.delete);
router.post('/:broadcastId/cancel', controller.cancel);

export default router;
