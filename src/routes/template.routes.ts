import { Router } from 'express';
import { TemplateController } from '../controllers/template.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new TemplateController();

router.use(authenticate);

router.get('/', controller.getTemplates);
router.post('/', controller.createTemplate);
router.get('/:templateId', controller.getTemplate);
router.put('/:templateId', controller.updateTemplate);
router.delete('/:templateId', controller.deleteTemplate);

export default router;
