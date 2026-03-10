import { Router } from 'express';
import { EventDrivenController } from '../controllers/event-driven.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new EventDrivenController();

router.use(authenticate);

router.get('/', controller.getAll);
router.post('/', controller.create);
router.get('/:configId', controller.getOne);
router.put('/:configId', controller.update);
router.delete('/:configId', controller.delete);
router.post('/:configId/toggle', controller.toggle);

export default router;
