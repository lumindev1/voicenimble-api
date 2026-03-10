import { Router } from 'express';
import { KnowledgeBaseController } from '../controllers/knowledge-base.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new KnowledgeBaseController();

router.use(authenticate);

router.get('/', controller.getAll);
router.post('/', controller.create);
router.get('/:kbId', controller.getOne);
router.put('/:kbId', controller.update);
router.delete('/:kbId', controller.delete);
router.post('/:kbId/documents', controller.addDocument);
router.delete('/:kbId/documents/:docId', controller.deleteDocument);

export default router;
