import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import KnowledgeBase from '../models/knowledge-base.model';
import { AppError } from '../middlewares/error.middleware';

export class KnowledgeBaseController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const kbs = await KnowledgeBase.find({ shopId: req.shopId }).sort({ createdAt: -1 });
      res.json({ success: true, knowledgeBases: kbs });
    } catch (error) {
      next(error);
    }
  }

  async getOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const kb = await KnowledgeBase.findOne({ _id: req.params.kbId, shopId: req.shopId });
      if (!kb) throw new AppError('Knowledge base not found', 404);
      res.json({ success: true, knowledgeBase: kb });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name } = req.body;
      if (!name) throw new AppError('Knowledge base name is required', 400);

      const kb = await KnowledgeBase.create({
        shopId: req.shopId,
        shopDomain: req.shopDomain,
        name,
        documents: [],
      });
      res.status(201).json({ success: true, knowledgeBase: kb });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const kb = await KnowledgeBase.findOneAndUpdate(
        { _id: req.params.kbId, shopId: req.shopId },
        { name: req.body.name },
        { new: true },
      );
      if (!kb) throw new AppError('Knowledge base not found', 404);
      res.json({ success: true, knowledgeBase: kb });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const kb = await KnowledgeBase.findOneAndDelete({ _id: req.params.kbId, shopId: req.shopId });
      if (!kb) throw new AppError('Knowledge base not found', 404);
      res.json({ success: true, message: 'Knowledge base deleted' });
    } catch (error) {
      next(error);
    }
  }

  async addDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const kb = await KnowledgeBase.findOne({ _id: req.params.kbId, shopId: req.shopId });
      if (!kb) throw new AppError('Knowledge base not found', 404);

      const { title, sourceType, content, fileUrl, sourceUrl } = req.body;
      if (!title || !sourceType) throw new AppError('Title and sourceType are required', 400);

      kb.documents.push({ title, sourceType, content, fileUrl, sourceUrl, createdAt: new Date() });
      await kb.save();

      res.status(201).json({ success: true, knowledgeBase: kb });
    } catch (error) {
      next(error);
    }
  }

  async deleteDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const kb = await KnowledgeBase.findOne({ _id: req.params.kbId, shopId: req.shopId });
      if (!kb) throw new AppError('Knowledge base not found', 404);

      kb.documents = kb.documents.filter((d) => d._id?.toString() !== req.params.docId);
      await kb.save();

      res.json({ success: true, knowledgeBase: kb });
    } catch (error) {
      next(error);
    }
  }
}
