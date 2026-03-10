import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import Contact from '../models/contact.model';
import { AppError } from '../middlewares/error.middleware';

export class ContactController {
  async getContacts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const search = req.query.search as string;
      const tag = req.query.tag as string;
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = { shopId: req.shopId };
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ];
      }
      if (tag) filter.tags = tag;

      const [contacts, total] = await Promise.all([
        Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Contact.countDocuments(filter),
      ]);

      res.json({ success: true, contacts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error) {
      next(error);
    }
  }

  async createContact(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, phone, email, tags } = req.body;
      if (!name || !phone) throw new AppError('Name and phone are required', 400);

      const contact = await Contact.create({
        shopId: req.shopId,
        shopDomain: req.shopDomain,
        name, phone, email,
        tags: tags || [],
      });
      res.status(201).json({ success: true, contact });
    } catch (error) {
      next(error);
    }
  }

  async updateContact(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const contact = await Contact.findOneAndUpdate(
        { _id: req.params.contactId, shopId: req.shopId },
        req.body,
        { new: true },
      );
      if (!contact) throw new AppError('Contact not found', 404);
      res.json({ success: true, contact });
    } catch (error) {
      next(error);
    }
  }

  async deleteContact(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const contact = await Contact.findOneAndDelete({ _id: req.params.contactId, shopId: req.shopId });
      if (!contact) throw new AppError('Contact not found', 404);
      res.json({ success: true, message: 'Contact deleted' });
    } catch (error) {
      next(error);
    }
  }

  async bulkDelete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) throw new AppError('No contact IDs provided', 400);
      await Contact.deleteMany({ _id: { $in: ids }, shopId: req.shopId });
      res.json({ success: true, message: `${ids.length} contact(s) deleted` });
    } catch (error) {
      next(error);
    }
  }

  async importContacts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { contacts } = req.body as { contacts: Array<{ name: string; phone: string; email?: string; tags?: string[] }> };
      if (!Array.isArray(contacts) || contacts.length === 0) throw new AppError('No contacts provided', 400);

      const docs = contacts.map((c) => ({
        shopId: req.shopId,
        shopDomain: req.shopDomain,
        name: c.name,
        phone: c.phone,
        email: c.email,
        tags: c.tags || [],
      }));

      const inserted = await Contact.insertMany(docs, { ordered: false });
      res.status(201).json({ success: true, count: inserted.length });
    } catch (error) {
      next(error);
    }
  }

  async getAllTags(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const tags = await Contact.distinct('tags', { shopId: req.shopId });
      res.json({ success: true, tags });
    } catch (error) {
      next(error);
    }
  }
}
