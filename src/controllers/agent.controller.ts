import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import Agent from '../models/agent.model';
import { AppError } from '../middlewares/error.middleware';
import { VoiceNimbleService } from '../services/voicenimble.service';

export class AgentController {
  // List all agents for this shop
  async getAgents(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const agents = await Agent.find({ shopId: req.shopId }).sort({ createdAt: -1 });
      res.json({ success: true, agents });
    } catch (error) {
      next(error);
    }
  }

  // Get single agent
  async getAgent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const agent = await Agent.findOne({ _id: req.params.agentId, shopId: req.shopId });
      if (!agent) throw new AppError('Agent not found', 404);
      res.json({ success: true, agent });
    } catch (error) {
      next(error);
    }
  }

  // Create new agent
  async createAgent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const isConfigured = !!(req.body.agentName && req.body.greetingMessage);
      const agent = await Agent.create({
        ...req.body,
        shopId: req.shopId,
        shopDomain: req.shopDomain,
        isConfigured,
      });
      res.status(201).json({ success: true, agent });
    } catch (error) {
      next(error);
    }
  }

  // Update agent
  async updateAgent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // If callType is being changed, check for conflict with active agents
      if (req.body.callType) {
        const currentAgent = await Agent.findOne({ _id: req.params.agentId, shopId: req.shopId });
        if (!currentAgent) throw new AppError('Agent not found', 404);

        if (req.body.callType !== currentAgent.callType) {
          const existingActive = await Agent.findOne({
            shopId: req.shopId,
            callType: req.body.callType,
            _id: { $ne: currentAgent._id },
            isActive: true,
          });

          if (existingActive) {
            throw new AppError(
              `Cannot change to ${req.body.callType}. You already have an active ${req.body.callType} agent ("${existingActive.agentName}"). Deactivate it first.`,
              400,
            );
          }
        }
      }

      const agent = await Agent.findOneAndUpdate(
        { _id: req.params.agentId, shopId: req.shopId },
        { ...req.body, shopDomain: req.shopDomain },
        { new: true, runValidators: true },
      );
      if (!agent) throw new AppError('Agent not found', 404);

      const isConfigured = !!(agent.agentName && agent.greetingMessage);
      agent.isConfigured = isConfigured;
      await agent.save();

      res.json({ success: true, agent });
    } catch (error) {
      next(error);
    }
  }

  // Delete agent
  async deleteAgent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const agent = await Agent.findOneAndDelete({ _id: req.params.agentId, shopId: req.shopId });
      if (!agent) throw new AppError('Agent not found', 404);
      res.json({ success: true, message: 'Agent deleted' });
    } catch (error) {
      next(error);
    }
  }

  async activateAgent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const agent = await Agent.findOne({ _id: req.params.agentId, shopId: req.shopId });
      if (!agent) throw new AppError('Agent not found', 404);
      if (!agent.isConfigured) throw new AppError('Please fill in Agent Name and Greeting Message before activating', 400);

      // Check if another agent with the same callType is already active
      const existingActive = await Agent.findOne({
        shopId: req.shopId,
        callType: agent.callType,
        _id: { $ne: agent._id },
        isActive: true,
      });

      if (existingActive) {
        throw new AppError(
          `You already have an active ${agent.callType} agent ("${existingActive.agentName}"). Please deactivate it first before activating this one.`,
          400,
        );
      }

      const existingAppSid = process.env.VOICENIMBLE_APPLICATION_SID || '7087fe50-8acb-4f3b-b820-97b573723aab';
      agent.voiceNimbleApplicationId = existingAppSid;
      agent.isActive = true;
      await agent.save();

      res.json({ success: true, agent, message: 'Agent activated successfully' });
    } catch (error) {
      next(error);
    }
  }

  async deactivateAgent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const agent = await Agent.findOneAndUpdate(
        { _id: req.params.agentId, shopId: req.shopId },
        { isActive: false },
        { new: true },
      );
      if (!agent) throw new AppError('Agent not found', 404);
      res.json({ success: true, agent, message: 'Agent deactivated' });
    } catch (error) {
      next(error);
    }
  }

  async getAvailableVoices(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const voices = [
        // Google TTS voices
        { id: 'en-US-Standard-F', name: 'Standard F', language: 'en-US', gender: 'female', vendor: 'google' },
        { id: 'en-US-Standard-B', name: 'Standard B', language: 'en-US', gender: 'male', vendor: 'google' },
        { id: 'en-US-Standard-C', name: 'Standard C', language: 'en-US', gender: 'female', vendor: 'google' },
        { id: 'en-US-Standard-D', name: 'Standard D', language: 'en-US', gender: 'male', vendor: 'google' },
        { id: 'en-US-Neural2-F', name: 'Neural2 F', language: 'en-US', gender: 'female', vendor: 'google' },
        { id: 'en-US-Neural2-D', name: 'Neural2 D', language: 'en-US', gender: 'male', vendor: 'google' },
        { id: 'en-US-Wavenet-F', name: 'WaveNet F', language: 'en-US', gender: 'female', vendor: 'google' },
        { id: 'en-US-Wavenet-D', name: 'WaveNet D', language: 'en-US', gender: 'male', vendor: 'google' },
        { id: 'en-GB-Standard-A', name: 'GB Standard A', language: 'en-GB', gender: 'female', vendor: 'google' },
        { id: 'en-GB-Standard-B', name: 'GB Standard B', language: 'en-GB', gender: 'male', vendor: 'google' },
        // ElevenLabs TTS voices
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', language: 'en-US', gender: 'female', vendor: 'elevenlabs' },
        { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', language: 'en-US', gender: 'male', vendor: 'elevenlabs' },
        { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', language: 'en-US', gender: 'female', vendor: 'elevenlabs' },
        { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', language: 'en-US', gender: 'female', vendor: 'elevenlabs' },
        { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', language: 'en-US', gender: 'male', vendor: 'elevenlabs' },
        { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', language: 'en-US', gender: 'male', vendor: 'elevenlabs' },
        { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', language: 'en-US', gender: 'male', vendor: 'elevenlabs' },
        { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', language: 'en-US', gender: 'male', vendor: 'elevenlabs' },
        { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', language: 'en-US', gender: 'female', vendor: 'elevenlabs' },
        { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', language: 'en-GB', gender: 'male', vendor: 'elevenlabs' },
      ];
      res.json({ success: true, voices });
    } catch (error) {
      next(error);
    }
  }

  async getAvailablePhoneNumbers(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const voiceNimble = new VoiceNimbleService();
      const numbers = await voiceNimble.getAvailablePhoneNumbers('US');
      res.json({ success: true, phoneNumbers: numbers });
    } catch (error) {
      next(error);
    }
  }

  async provisionPhoneNumber(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phoneNumber } = req.body;
      const agent = await Agent.findOne({ _id: req.params.agentId, shopId: req.shopId });
      if (!agent) throw new AppError('Agent not found', 404);

      const voiceNimble = new VoiceNimbleService();
      const sid = await voiceNimble.provisionPhoneNumber(phoneNumber, agent.voiceNimbleApplicationId);

      agent.phoneNumber = phoneNumber;
      agent.phoneNumberSid = sid;
      await agent.save();

      res.json({ success: true, phoneNumber, sid });
    } catch (error) {
      next(error);
    }
  }
}
