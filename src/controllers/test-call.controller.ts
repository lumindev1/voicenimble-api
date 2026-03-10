import { Response, NextFunction } from 'express';
import axios from 'axios';
import { AuthRequest } from '../middlewares/auth.middleware';
import Agent from '../models/agent.model';
import CallTemplate from '../models/call-template.model';
import { AppError } from '../middlewares/error.middleware';

export class TestCallController {
  async makeTestCall(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { to, fromNumber, templateId, agentId } = req.body;
      if (!to) throw new AppError('Recipient number is required', 400);

      const agent = agentId
        ? await Agent.findOne({ _id: agentId, shopId: req.shopId })
        : await Agent.findOne({ shopId: req.shopId, isActive: true });

      if (!agent) throw new AppError('No active agent found', 400);

      const template = templateId
        ? await CallTemplate.findOne({ _id: templateId, shopId: req.shopId })
        : null;

      const baseUrl = process.env.JAMBONZ_BASE_URL!;
      const apiKey = process.env.JAMBONZ_API_KEY!;
      const accountSid = process.env.JAMBONZ_ACCOUNT_SID!;
      const appUrl = process.env.APP_URL!;

      const from = fromNumber || agent.byonPhoneNumber || agent.phoneNumber || process.env.DEFAULT_FROM_NUMBER || '';

      const tag = {
        agentId: agent._id.toString(),
        shopDomain: agent.shopDomain,
        direction: 'outbound',
        callType: 'test',
        ...(template ? { templateId: template._id.toString() } : {}),
      };

      const response = await axios.post(
        `${baseUrl}/v1/Accounts/${accountSid}/Calls`,
        {
          application_sid: process.env.JAMBONZ_APPLICATION_SID || '7087fe50-8acb-4f3b-b820-97b573723aab',
          from,
          to: { type: 'phone', number: to },
          tag,
          call_hook: {
            url: `${appUrl}/jambonz/call-event`,
            method: 'POST',
          },
          call_status_hook: { url: `${appUrl}/jambonz/call-status`, method: 'POST' },
        },
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );

      res.json({ success: true, callSid: response.data.sid, message: 'Test call initiated' });
    } catch (error) {
      next(error);
    }
  }

  async getFromNumbers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const agents = await Agent.find({ shopId: req.shopId }).select('agentName phoneNumber byonPhoneNumber');
      const numbers = agents
        .flatMap((a) => [a.phoneNumber, a.byonPhoneNumber])
        .filter(Boolean) as string[];
      const unique = [...new Set(numbers)];
      res.json({ success: true, numbers: unique });
    } catch (error) {
      next(error);
    }
  }
}
