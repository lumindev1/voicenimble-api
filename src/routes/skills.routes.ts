import { Router } from 'express';
import { SkillsController } from '../controllers/skills.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new SkillsController();

router.use(authenticate);

router.get('/', controller.getSkills);
router.put('/', controller.updateSkills);
router.put('/:skillId/toggle', controller.toggleSkill);

export default router;
