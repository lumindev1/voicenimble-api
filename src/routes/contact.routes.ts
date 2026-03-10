import { Router } from 'express';
import { ContactController } from '../controllers/contact.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const controller = new ContactController();

router.use(authenticate);

router.get('/', controller.getContacts);
router.post('/', controller.createContact);
router.post('/import', controller.importContacts);
router.delete('/bulk', controller.bulkDelete);
router.get('/tags', controller.getAllTags);
router.put('/:contactId', controller.updateContact);
router.delete('/:contactId', controller.deleteContact);

export default router;
