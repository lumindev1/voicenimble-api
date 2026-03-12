import Agent from '../models/agent.model';
import Shop from '../models/shop.model';
import Call, { ICall } from '../models/call.model';
import CallTemplate from '../models/call-template.model';
import CallTranscript from '../models/call-transcript.model';
import Subscription from '../models/subscription.model';
import { AIConversationService } from './ai-conversation.service';
import { JambonzService } from './jambonz.service';
import { analyticsQueue, emailQueue } from '../jobs/queues';
import logger from '../utils/logger';

interface JambonzCallPayload {
  call_sid: string;
  call_status?: string;
  to: string;
  from: string;
  direction?: string;
  duration?: number;
  recording_url?: string;
  speech?: { alternatives?: Array<{ transcript: string; confidence: number }> };
  call_termination_by?: string;
  // Injected via query params for outbound/test calls
  agentId?: string;
  shopDomain?: string;
  templateId?: string;
  callType?: string; // 'test' | 'broadcast' | 'event'
  // Jambonz renames the "tag" field to "customerData" in webhook payloads
  customerData?: Record<string, string>;
  tag?: string | Record<string, string>;
}

export class JambonzWebhookService {
  private readonly aiService = new AIConversationService();
  private readonly jambonz = new JambonzService();

  async handleIncomingCall(payload: JambonzCallPayload): Promise<unknown[]> {
    logger.info(`Raw call payload: ${JSON.stringify(payload)}`);
    // Jambonz sends the "tag" field as "customerData" in webhook payloads
    let tagData: Record<string, string> = {};
    if (payload.customerData) {
      tagData = payload.customerData;
    } else if (payload.tag) {
      if (typeof payload.tag === 'object') {
        tagData = payload.tag;
      } else {
        try { tagData = JSON.parse(payload.tag); } catch { /* ignore */ }
      }
    }

    const {
      call_sid, to, from,
      agentId: agentIdFromQuery,
      shopDomain: shopDomainFromQuery,
      templateId: templateIdFromQuery,
      direction: callDirection,
    } = payload;

    const agentId = agentIdFromQuery || tagData.agentId;
    const shopDomain = shopDomainFromQuery || tagData.shopDomain;
    const templateId = templateIdFromQuery || tagData.templateId;

    logger.info(`Call event: ${call_sid} from ${from} to ${to}, agentId=${agentId}, direction=${callDirection}`);

    // Resolve agent: outbound passes agentId, inbound looks up by phone number, fallback to any active
    let agent;
    if (agentId) {
      agent = await Agent.findById(agentId).populate('shopId');
    } else {
      // Try by phone number first
      agent = await Agent.findOne({
        $or: [{ phoneNumber: to }, { byonPhoneNumber: to }, { phoneNumber: from }, { byonPhoneNumber: from }],
        isActive: true,
      }).populate('shopId');
      // Fallback: prefer inbound agent, then any active agent
      if (!agent) {
        agent = await Agent.findOne({ isActive: true, callType: 'inbound' }).populate('shopId');
        if (!agent) {
          agent = await Agent.findOne({ isActive: true }).populate('shopId');
        }
        if (agent) logger.info(`Fallback: using ${agent.callType} agent ${agent.agentName} (${agent._id})`);
      }
    }

    if (!agent) {
      logger.warn(`No active agent found for number: ${to}, agentId: ${agentId}`);
      return [
        this.jambonz.buildSayVerb('Sorry, this service is currently unavailable. Please try again later.', 'en-US-Wavenet-C', 'google'),
        { verb: 'hangup' },
      ];
    }

    const shop = shopDomain
      ? await Shop.findOne({ shopDomain })
      : await Shop.findById(agent.shopId);

    if (!shop || !shop.isActive) {
      return [this.jambonz.buildSayVerb('Sorry, this service is currently unavailable.', 'en-US-Wavenet-C', 'google'), { verb: 'hangup' }];
    }

    // Check simultaneous call limit
    const activeCalls = await Call.countDocuments({ shopId: agent.shopId, status: 'in-progress' });
    const subscription = await Subscription.findOne({ shopId: agent.shopId });
    const maxCalls = subscription?.simultaneousCalls || 3;

    if (activeCalls >= maxCalls) {
      return [
        this.jambonz.buildSayVerb('All our agents are currently busy. Please try again shortly.', 'en-US-Wavenet-C', 'google'),
        { verb: 'hangup' },
      ];
    }

    // Resolve call template text if provided
    let templateText: string | undefined;
    let greeting = agent.greetingMessage;

    if (templateId) {
      const template = await CallTemplate.findById(templateId);
      if (template?.text) {
        templateText = template.text;
        // For static or AI-text templates, use template text as greeting if it's a short script
        if (template.type === 'static' && template.text) {
          greeting = template.text.split('\n')[0].slice(0, 300); // first line as greeting
        }
      }
    }

    // Determine direction
    const direction = callDirection === 'outbound' ? 'outbound' : 'inbound';

    // Create call record
    const call = await Call.create({
      shopId: agent.shopId,
      shopDomain: shop.shopDomain,
      agentId: agent._id,
      callSid: call_sid,
      direction,
      status: 'in-progress',
      callerNumber: from,
      calledNumber: to,
      startedAt: new Date(),
      answeredAt: new Date(),
    });

    logger.info(`Call record created: ${call._id}, direction: ${direction}`);

    // Extract event-driven context from tag
    const eventType = tagData.eventType;
    let orderContext: Record<string, unknown> | undefined;
    if (tagData.orderContext) {
      try {
        orderContext = typeof tagData.orderContext === 'string'
          ? JSON.parse(tagData.orderContext)
          : tagData.orderContext;
      } catch { /* ignore parse errors */ }
    }

    // Initialize AI conversation (with optional template and event context)
    await this.aiService.initializeConversation(
      call_sid,
      shop.shopDomain,
      agent._id.toString(),
      shop.accessToken,
      templateText,
      eventType,
      orderContext as Record<string, unknown> | undefined,
    );

    // Build JCML response
    const gatherUrl = `${process.env.APP_URL}/jambonz/gather-result?callSid=${call_sid}`;
    const jcml: unknown[] = [];

    // Recording if subscription supports it
    if (subscription?.hasCallRecording) {
      jcml.push(this.jambonz.buildRecordVerb(`${process.env.APP_URL}/jambonz/recording-status?callSid=${call_sid}`));
    }

    // Handle static template with audio URL
    if (templateId) {
      const template = await CallTemplate.findById(templateId);
      if (template?.type === 'static' && template.audioUrl) {
        // Play pre-recorded audio then gather
        jcml.push(
          { verb: 'play', url: template.audioUrl },
          this.jambonz.buildGatherVerb(gatherUrl, [], 8),
        );
        return jcml;
      }
    }

    // Default: TTS greeting then gather
    const recognizerLang = agent.primaryLanguage || 'en-US';
    jcml.push(
      this.jambonz.buildSayVerb(greeting, agent.voiceId, 'google', agent.voiceSpeed),
      this.jambonz.buildGatherVerb(gatherUrl, [], 8, recognizerLang),
    );

    return jcml;
  }

  async handleUserSpeech(payload: JambonzCallPayload): Promise<unknown[]> {
    const { call_sid, speech } = payload;

    const userInput = speech?.alternatives?.[0]?.transcript || '';
    logger.info(`User speech [${call_sid}]: "${userInput}"`);

    if (!userInput.trim()) {
      const state = await this.aiService.getConversationState(call_sid);
      const agent = state ? await Agent.findById(state.agentId) : null;
      const lang = agent?.primaryLanguage || 'en-US';
      const gatherUrl = `${process.env.APP_URL}/jambonz/gather-result?callSid=${call_sid}`;
      return [
        this.jambonz.buildSayVerb('I didn\'t catch that, could you please say that again?', agent?.voiceId || 'en-US-Wavenet-C', 'google', agent?.voiceSpeed),
        this.jambonz.buildGatherVerb(gatherUrl, [], 8, lang),
      ];
    }

    const state = await this.aiService.getConversationState(call_sid);
    if (!state) {
      return [
        this.jambonz.buildSayVerb('Sorry, something went wrong. Please call again.', 'en-US-Wavenet-C', 'google'),
        { verb: 'hangup' },
      ];
    }

    const agent = await Agent.findById(state.agentId);

    // Process with Claude AI
    const aiResponse = await this.aiService.processUserInput(call_sid, userInput);
    logger.info(`AI response [${call_sid}]: "${aiResponse.text}"`);

    // Update call metadata
    if (aiResponse.intent || aiResponse.sentiment) {
      await Call.findOneAndUpdate(
        { callSid: call_sid },
        {
          ...(aiResponse.intent && { intentDetected: aiResponse.intent }),
          ...(aiResponse.sentiment && { sentiment: aiResponse.sentiment }),
        },
      );
    }

    // Transfer to human
    if (aiResponse.shouldTransfer && agent?.humanHandoffNumber) {
      const transferTo = agent.humanHandoffNumber;
      await Call.findOneAndUpdate(
        { callSid: call_sid },
        { wasTransferred: true, transferredTo: transferTo, transferredAt: new Date() },
      );
      return [
        this.jambonz.buildSayVerb(
          `${aiResponse.text} I'm now transferring you to one of our team members.`,
          agent.voiceId, 'google', agent.voiceSpeed,
        ),
        this.jambonz.buildTransferVerb(transferTo),
      ];
    }

    // End call
    if (aiResponse.shouldEndCall) {
      return [
        this.jambonz.buildSayVerb(aiResponse.text, agent?.voiceId, 'google', agent?.voiceSpeed),
        { verb: 'hangup' },
      ];
    }

    // Continue conversation
    const lang = agent?.primaryLanguage || 'en-US';
    const gatherUrl = `${process.env.APP_URL}/jambonz/gather-result?callSid=${call_sid}`;
    return [
      this.jambonz.buildSayVerb(aiResponse.text, agent?.voiceId, 'google', agent?.voiceSpeed),
      this.jambonz.buildGatherVerb(gatherUrl, [], 10, lang),
    ];
  }

  async handleCallStatus(payload: JambonzCallPayload): Promise<void> {
    const { call_sid, call_status, duration, to, from } = payload;
    logger.info(`Call status update [${call_sid}]: ${call_status}, duration: ${duration}s, from: ${from}, to: ${to}`);

    if (call_status === 'completed' || call_status === 'failed' || call_status === 'no-answer' || call_status === 'busy' || call_status === 'canceled') {
      let call = await Call.findOneAndUpdate(
        { callSid: call_sid },
        {
          status: call_status as ICall['status'],
          duration: duration || 0,
          endedAt: new Date(),
          minutesBilled: Math.ceil((duration || 0) / 60),
        },
        { new: true },
      );

      // Call record missing — happens when declined/busy before call_hook fires.
      // Create a minimal record so it appears in history and analytics.
      if (!call && (call_status === 'busy' || call_status === 'no-answer' || call_status === 'failed' || call_status === 'canceled')) {
        const agent = await Agent.findOne({ isActive: true });
        if (agent) {
          const shop = await Shop.findById(agent.shopId);
          if (shop) {
            call = await Call.create({
              shopId: agent.shopId,
              shopDomain: shop.shopDomain,
              agentId: agent._id,
              callSid: call_sid,
              direction: 'outbound',
              status: call_status as ICall['status'],
              callerNumber: from || '',
              calledNumber: to || '',
              duration: 0,
              startedAt: new Date(),
              endedAt: new Date(),
            });
            logger.info(`Created missed call record for ${call_sid} (${call_status})`);
          }
        }
      }

      if (!call) return;

      await this.saveTranscript(call_sid, call._id.toString(), call.shopId.toString());
      await this.aiService.deleteConversationState(call_sid);

      await analyticsQueue.add('update-daily-analytics', {
        shopId: call.shopId.toString(),
        shopDomain: call.shopDomain,
        date: new Date().toISOString().split('T')[0],
        callId: call._id.toString(),
      });

      await emailQueue.add('call-completed-notification', {
        shopId: call.shopId.toString(),
        shopDomain: call.shopDomain,
        callId: call._id.toString(),
      });

      await Subscription.findOneAndUpdate(
        { shopId: call.shopId },
        { $inc: { minutesUsed: Math.ceil((duration || 0) / 60) } },
      );
    }
  }

  async handleRecordingComplete(payload: Record<string, string>): Promise<void> {
    const { callSid, RecordingUrl, RecordingDuration, RecordingSid } = payload;
    logger.info(`Recording complete for call: ${callSid}`);
    await Call.findOneAndUpdate(
      { callSid },
      {
        hasRecording: true,
        recordingUrl: RecordingUrl,
        recordingDuration: parseInt(RecordingDuration || '0', 10),
        recordingSid: RecordingSid,
      },
    );
  }

  async buildTransferResponse(payload: JambonzCallPayload): Promise<unknown[]> {
    const { call_sid } = payload;
    const state = await this.aiService.getConversationState(call_sid);
    const agent = state ? await Agent.findById(state.agentId) : null;

    if (agent?.humanHandoffNumber) {
      return [this.jambonz.buildTransferVerb(agent.humanHandoffNumber)];
    }

    return [
      this.jambonz.buildSayVerb('Transfer unavailable. Thank you for calling. Goodbye.'),
      { verb: 'hangup' },
    ];
  }

  private async saveTranscript(callSid: string, callId: string, shopId: string): Promise<void> {
    const messages = await this.aiService.getConversationMessages(callSid);
    if (messages.length === 0) return;

    const fullText = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

    const transcript = await CallTranscript.create({
      shopId,
      callId,
      callSid,
      messages: messages.map((m) => ({ role: m.role, content: m.content, timestamp: new Date() })),
      fullText,
    });

    await Call.findByIdAndUpdate(callId, { hasTranscript: true, transcriptId: transcript._id });
  }
}
