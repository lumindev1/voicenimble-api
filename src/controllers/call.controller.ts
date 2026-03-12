import { Response, NextFunction } from 'express';
import axios from 'axios';
import { AuthRequest } from '../middlewares/auth.middleware';
import Call from '../models/call.model';
import CallTranscript from '../models/call-transcript.model';
import Agent from '../models/agent.model';
import { AppError } from '../middlewares/error.middleware';

export class CallController {
  async getCalls(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = { shopId: req.shopId };
      if (status) filter.status = status;

      const [calls, total] = await Promise.all([
        Call.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('-jambonzData'),
        Call.countDocuments(filter),
      ]);

      res.json({
        success: true,
        calls,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (error) {
      next(error);
    }
  }

  async getCall(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const call = await Call.findOne({ _id: req.params.callId, shopId: req.shopId });
      if (!call) throw new AppError('Call not found', 404);
      res.json({ success: true, call });
    } catch (error) {
      next(error);
    }
  }

  async getTranscript(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const call = await Call.findOne({ _id: req.params.callId, shopId: req.shopId });
      if (!call) throw new AppError('Call not found', 404);

      const transcript = await CallTranscript.findOne({ callId: call._id });
      if (!transcript) throw new AppError('Transcript not available', 404);

      res.json({ success: true, transcript });
    } catch (error) {
      next(error);
    }
  }

  async makeOutboundCall(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { to, from } = req.body;
      if (!to) {
        res.status(400).json({ success: false, message: 'Missing "to" phone number' });
        return;
      }

      // Find the active outbound agent for this shop, fallback to any active agent
      let agent = await Agent.findOne({ shopId: req.shopId, isActive: true, callType: 'outbound' });
      if (!agent) {
        agent = await Agent.findOne({ shopId: req.shopId, isActive: true });
      }
      if (!agent) {
        res.status(400).json({ success: false, message: 'No active agent found. Please activate your agent first.' });
        return;
      }

      const baseUrl = process.env.JAMBONZ_BASE_URL!;
      const apiKey = process.env.JAMBONZ_API_KEY!;
      const accountSid = process.env.JAMBONZ_ACCOUNT_SID!;
      const appUrl = process.env.APP_URL!;
      const fromNumber = from || agent.byonPhoneNumber || agent.phoneNumber || process.env.DEFAULT_FROM_NUMBER || '01521206630';

      const tag = {
        agentId: agent._id.toString(),
        shopDomain: agent.shopDomain,
        direction: 'outbound',
        callType: 'outbound',
      };

      const response = await axios.post(
        `${baseUrl}/v1/Accounts/${accountSid}/Calls`,
        {
          application_sid: process.env.JAMBONZ_APPLICATION_SID || '7087fe50-8acb-4f3b-b820-97b573723aab',
          from: fromNumber,
          to: { type: 'phone', number: to },
          tag,
          call_hook: {
            url: `${appUrl}/jambonz/call-event`,
            method: 'POST',
          },
          call_status_hook: {
            url: `${appUrl}/jambonz/call-status`,
            method: 'POST',
          },
        },
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );

      res.json({ success: true, callSid: response.data.sid });
    } catch (error) {
      next(error);
    }
  }

  async getRecordingUrl(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const call = await Call.findOne({ _id: req.params.callId, shopId: req.shopId });
      if (!call) throw new AppError('Call not found', 404);
      if (!call.hasRecording || !call.recordingUrl) {
        throw new AppError('No recording available for this call', 404);
      }
      res.json({ success: true, recordingUrl: call.recordingUrl });
    } catch (error) {
      next(error);
    }
  }
}
