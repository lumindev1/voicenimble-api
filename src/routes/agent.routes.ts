import { Router } from 'express';
import { AgentController } from '../controllers/agent.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new AgentController();

router.use(authenticate);

router.get('/', controller.getAgents);
router.post('/', controller.createAgent);
router.get('/voices', controller.getAvailableVoices);
router.get('/phone-numbers', controller.getAvailablePhoneNumbers);

router.get('/:agentId', controller.getAgent);
router.put('/:agentId', controller.updateAgent);
router.delete('/:agentId', controller.deleteAgent);
router.post('/:agentId/activate', controller.activateAgent);
router.post('/:agentId/deactivate', controller.deactivateAgent);
router.post('/:agentId/provision-number', controller.provisionPhoneNumber);

export default router;
