import { Router } from 'express';
import { SipTrunkController } from '../controllers/sip-trunk.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new SipTrunkController();

router.use(authenticate);

router.get('/', controller.getAll);
router.post('/', controller.create);
router.get('/:trunkId', controller.getOne);
router.put('/:trunkId', controller.update);
router.delete('/:trunkId', controller.delete);
router.post('/:trunkId/set-default', controller.setDefault);

export default router;
