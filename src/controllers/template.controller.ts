import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import CallTemplate from '../models/call-template.model';
import { AppError } from '../middlewares/error.middleware';

export class TemplateController {
  async getTemplates(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const templates = await CallTemplate.find({ shopId: req.shopId }).sort({ createdAt: -1 });
      res.json({ success: true, templates });
    } catch (error) {
      next(error);
    }
  }

  async getTemplate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const template = await CallTemplate.findOne({ _id: req.params.templateId, shopId: req.shopId });
      if (!template) throw new AppError('Template not found', 404);
      res.json({ success: true, template });
    } catch (error) {
      next(error);
    }
  }

  async createTemplate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, type, aiContentType, text, audioUrl } = req.body;
      if (!name) throw new AppError('Template name is required', 400);

      const template = await CallTemplate.create({
        shopId: req.shopId,
        shopDomain: req.shopDomain,
        name, type, aiContentType, text, audioUrl,
      });
      res.status(201).json({ success: true, template });
    } catch (error) {
      next(error);
    }
  }

  async updateTemplate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const template = await CallTemplate.findOneAndUpdate(
        { _id: req.params.templateId, shopId: req.shopId },
        req.body,
        { new: true },
      );
      if (!template) throw new AppError('Template not found', 404);
      res.json({ success: true, template });
    } catch (error) {
      next(error);
    }
  }

  async deleteTemplate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const template = await CallTemplate.findOneAndDelete({ _id: req.params.templateId, shopId: req.shopId });
      if (!template) throw new AppError('Template not found', 404);
      res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
      next(error);
    }
  }
}
