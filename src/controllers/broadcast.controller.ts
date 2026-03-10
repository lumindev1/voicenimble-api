import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import Broadcast from '../models/broadcast.model';
import Contact from '../models/contact.model';
import { broadcastQueue } from '../jobs/queues';
import { AppError } from '../middlewares/error.middleware';

export class BroadcastController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = { shopId: req.shopId };
      if (req.query.status) filter.status = req.query.status;

      const [broadcasts, total] = await Promise.all([
        Broadcast.find(filter)
          .populate('templateId', 'name type')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Broadcast.countDocuments(filter),
      ]);

      res.json({ success: true, broadcasts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error) {
      next(error);
    }
  }

  async getOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const broadcast = await Broadcast.findOne({ _id: req.params.broadcastId, shopId: req.shopId })
        .populate('templateId', 'name type')
        .populate('contactIds', 'name phone email tags');
      if (!broadcast) throw new AppError('Broadcast not found', 404);
      res.json({ success: true, broadcast });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title, templateId, agentId, tags, contactIds, scheduledAt, timezone } = req.body;
      if (!title || !templateId) throw new AppError('Title and template are required', 400);

      // Resolve contact count
      let resolvedContactIds = contactIds || [];
      if (tags && tags.length > 0) {
        const tagContacts = await Contact.find({ shopId: req.shopId, tags: { $in: tags } }).select('_id');
        const tagIds = tagContacts.map((c) => c._id.toString());
        resolvedContactIds = [...new Set([...resolvedContactIds, ...tagIds])];
      }

      const broadcast = await Broadcast.create({
        shopId: req.shopId,
        shopDomain: req.shopDomain,
        title, templateId, agentId, tags,
        contactIds: resolvedContactIds,
        totalContacts: resolvedContactIds.length,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        timezone: timezone || 'UTC',
        status: 'pending',
      });

      // Schedule the broadcast job
      const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
      const delay = scheduledDate ? Math.max(0, scheduledDate.getTime() - Date.now()) : 0;

      await broadcastQueue.add(
        'execute-broadcast',
        { broadcastId: broadcast._id.toString() },
        {
          jobId: `broadcast-${broadcast._id.toString()}`,
          delay,
        },
      );

      res.status(201).json({ success: true, broadcast });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const broadcast = await Broadcast.findOneAndDelete({ _id: req.params.broadcastId, shopId: req.shopId });
      if (!broadcast) throw new AppError('Broadcast not found', 404);
      res.json({ success: true, message: 'Broadcast deleted' });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const broadcast = await Broadcast.findOneAndUpdate(
        { _id: req.params.broadcastId, shopId: req.shopId, status: { $in: ['pending', 'running'] } },
        { status: 'cancelled' },
        { new: true },
      );
      if (!broadcast) throw new AppError('Broadcast not found or already completed', 404);
      res.json({ success: true, broadcast });
    } catch (error) {
      next(error);
    }
  }
}
