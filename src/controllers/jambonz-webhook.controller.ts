import { Request, Response, NextFunction } from 'express';
import { JambonzWebhookService } from '../services/jambonz-webhook.service';

const webhookService = new JambonzWebhookService();

export class JambonzWebhookController {
  async handleCallEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = { ...req.body, ...req.query };
      const jcml = await webhookService.handleIncomingCall(payload);
      res.json(jcml);
    } catch (error) {
      next(error);
    }
  }

  async handleCallStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await webhookService.handleCallStatus(req.body);
      res.json([]);
    } catch (error) {
      next(error);
    }
  }

  async handleGatherResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const jcml = await webhookService.handleUserSpeech(req.body);
      res.json(jcml);
    } catch (error) {
      next(error);
    }
  }

  async handleRecordingStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await webhookService.handleRecordingComplete(req.body);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async handleTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const jcml = await webhookService.buildTransferResponse(req.body);
      res.json(jcml);
    } catch (error) {
      next(error);
    }
  }
}
