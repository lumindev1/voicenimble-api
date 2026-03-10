import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import EventDriven from '../models/event-driven.model';
import { AppError } from '../middlewares/error.middleware';

export class EventDrivenController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const configs = await EventDriven.find({ shopId: req.shopId })
        .populate('templateId', 'name type')
        .populate('agentId', 'agentName callType')
        .sort({ createdAt: -1 });
      res.json({ success: true, configs });
    } catch (error) {
      next(error);
    }
  }

  async getOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const config = await EventDriven.findOne({ _id: req.params.configId, shopId: req.shopId });
      if (!config) throw new AppError('Event-driven config not found', 404);
      res.json({ success: true, config });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, triggerEvent, templateId, agentId, fromNumber } = req.body;
      if (!name || !triggerEvent || !templateId) {
        throw new AppError('Name, trigger event, and template are required', 400);
      }

      const config = await EventDriven.create({
        shopId: req.shopId,
        shopDomain: req.shopDomain,
        name, triggerEvent, templateId, agentId, fromNumber,
        isActive: true,
      });
      res.status(201).json({ success: true, config });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const config = await EventDriven.findOneAndUpdate(
        { _id: req.params.configId, shopId: req.shopId },
        req.body,
        { new: true },
      );
      if (!config) throw new AppError('Event-driven config not found', 404);
      res.json({ success: true, config });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const config = await EventDriven.findOneAndDelete({ _id: req.params.configId, shopId: req.shopId });
      if (!config) throw new AppError('Event-driven config not found', 404);
      res.json({ success: true, message: 'Config deleted' });
    } catch (error) {
      next(error);
    }
  }

  async toggle(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const config = await EventDriven.findOne({ _id: req.params.configId, shopId: req.shopId });
      if (!config) throw new AppError('Event-driven config not found', 404);
      config.isActive = !config.isActive;
      await config.save();
      res.json({ success: true, config });
    } catch (error) {
      next(error);
    }
  }
}
