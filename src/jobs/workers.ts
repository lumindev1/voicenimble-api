import { Worker, Job } from 'bullmq';
import axios from 'axios';
import Analytics from '../models/analytics.model';
import Call from '../models/call.model';
import Broadcast from '../models/broadcast.model';
import Contact from '../models/contact.model';
import Agent from '../models/agent.model';
import Shop from '../models/shop.model';
import CallTemplate from '../models/call-template.model';
import EventDriven from '../models/event-driven.model';
import SipTrunk from '../models/sip-trunk.model';
import { EmailService } from '../services/email.service';
import logger from '../utils/logger';

const emailService = new EmailService();

async function processAnalyticsJob(job: Job): Promise<void> {
  const { shopId, shopDomain, date, callId } = job.data as {
    shopId: string;
    shopDomain: string;
    date: string;
    callId: string;
  };

  const call = await Call.findById(callId);
  if (!call) return;

  await Analytics.findOneAndUpdate(
    { shopId, date },
    {
      $setOnInsert: { shopId, shopDomain, date },
      $inc: {
        totalCalls: 1,
        ...(call.status === 'completed' && { completedCalls: 1 }),
        ...(call.status === 'failed' && { failedCalls: 1 }),
        ...(call.wasTransferred && { transferredCalls: 1 }),
        totalDuration: call.duration,
        minutesBilled: call.minutesBilled,
        ...(call.sentiment === 'positive' && { positiveSentiment: 1 }),
        ...(call.sentiment === 'neutral' && { neutralSentiment: 1 }),
        ...(call.sentiment === 'negative' && { negativeSentiment: 1 }),
        ...(call.resolutionStatus === 'resolved' && { resolvedCalls: 1 }),
        ...(call.resolutionStatus === 'unresolved' && { unresolvedCalls: 1 }),
      },
    },
    { upsert: true, new: true },
  );

  // Update average duration
  const analytics = await Analytics.findOne({ shopId, date });
  if (analytics && analytics.totalCalls > 0) {
    analytics.averageDuration = analytics.totalDuration / analytics.totalCalls;
    await analytics.save();
  }
}

async function processEmailJob(job: Job): Promise<void> {
  const { type, shopId, shopDomain, callId } = job.data as {
    type?: string;
    shopId: string;
    shopDomain: string;
    callId?: string;
  };

  if (job.name === 'call-completed-notification' && callId) {
    await emailService.sendCallCompletedNotification(callId, shopDomain);
  } else if (job.name === 'daily-summary') {
    await emailService.sendDailySummaryEmail(shopDomain);
  }
}

async function processBroadcastJob(job: Job): Promise<void> {
  const { broadcastId } = job.data as { broadcastId: string };

  const broadcast = await Broadcast.findById(broadcastId);
  if (!broadcast || broadcast.status === 'cancelled') return;

  // Mark as running
  broadcast.status = 'running';
  broadcast.startedAt = new Date();
  await broadcast.save();

  // Load agent and template
  const agent = broadcast.agentId
    ? await Agent.findById(broadcast.agentId)
    : await Agent.findOne({ shopId: broadcast.shopId, isActive: true });

  if (!agent) {
    broadcast.status = 'failed';
    broadcast.completedAt = new Date();
    await broadcast.save();
    logger.error(`Broadcast ${broadcastId}: no agent found`);
    return;
  }

  const template = await CallTemplate.findById(broadcast.templateId);

  // Load contacts
  const contacts = await Contact.find({ _id: { $in: broadcast.contactIds } });

  const baseUrl = process.env.VOICENIMBLE_BASE_URL!;
  const apiKey = process.env.VOICENIMBLE_API_KEY!;
  const accountSid = process.env.VOICENIMBLE_ACCOUNT_SID!;
  const appUrl = process.env.APP_URL!;

  // Look up merchant's SIP trunk
  const sipTrunk = await SipTrunk.findOne({ shopId: broadcast.shopId, isDefault: true, isActive: true });
  const from = sipTrunk?.callerIdNumber || agent.byonPhoneNumber || agent.phoneNumber || process.env.DEFAULT_FROM_NUMBER || '';

  for (const contact of contacts) {
    // Re-check cancellation between calls
    const freshBroadcast = await Broadcast.findById(broadcastId);
    if (!freshBroadcast || freshBroadcast.status === 'cancelled') return;

    try {
      const tag = {
        agentId: agent._id.toString(),
        shopDomain: broadcast.shopDomain,
        direction: 'outbound',
        callType: 'broadcast',
        broadcastId: broadcastId,
        ...(template ? { templateId: template._id.toString() } : {}),
      };

      const callPayload: Record<string, unknown> = {
        application_sid: process.env.VOICENIMBLE_APPLICATION_SID,
        from,
        to: { type: 'phone', number: contact.phone },
        tag,
        call_hook: { url: `${appUrl}/voicenimble/call-event`, method: 'POST' },
        call_status_hook: { url: `${appUrl}/voicenimble/call-status`, method: 'POST' },
      };

      if (sipTrunk?.voiceNimbleCarrierSid) {
        callPayload.voip_carrier_sid = sipTrunk.voiceNimbleCarrierSid;
      }

      await axios.post(
        `${baseUrl}/v1/Accounts/${accountSid}/Calls`,
        callPayload,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );

      await Broadcast.findByIdAndUpdate(broadcastId, {
        $inc: { calledCount: 1, successCount: 1 },
      });

      logger.info(`Broadcast ${broadcastId}: called ${contact.phone}`);
    } catch (err) {
      await Broadcast.findByIdAndUpdate(broadcastId, {
        $inc: { calledCount: 1, failedCount: 1 },
      });
      logger.error(`Broadcast ${broadcastId}: failed to call ${contact.phone}`, err);
    }

    // Small delay between calls to avoid rate limiting
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Mark completed
  await Broadcast.findByIdAndUpdate(broadcastId, {
    status: 'completed',
    completedAt: new Date(),
  });

  logger.info(`Broadcast ${broadcastId} completed`);
}

async function processEventDrivenJob(job: Job): Promise<void> {
  const {
    shopId, shopDomain, configId, agentId, templateId,
    fromNumber, customerPhone, eventType, orderContext,
  } = job.data as {
    shopId: string;
    shopDomain: string;
    configId: string;
    agentId?: string;
    templateId: string;
    fromNumber?: string;
    customerPhone: string;
    eventType: string;
    orderContext: Record<string, unknown>;
  };

  // Load agent: use config's agentId or fall back to shop's active agent
  const agent = agentId
    ? await Agent.findById(agentId)
    : await Agent.findOne({ shopId, isActive: true });

  if (!agent) {
    logger.error(`Event-driven job ${job.id}: no agent found for shop ${shopDomain}`);
    return;
  }

  const template = await CallTemplate.findById(templateId);

  const baseUrl = process.env.VOICENIMBLE_BASE_URL!;
  const apiKey = process.env.VOICENIMBLE_API_KEY!;
  const accountSid = process.env.VOICENIMBLE_ACCOUNT_SID!;
  const appUrl = process.env.APP_URL!;

  // Look up merchant's SIP trunk
  const sipTrunk = await SipTrunk.findOne({ shopId, isDefault: true, isActive: true });
  const from = fromNumber || sipTrunk?.callerIdNumber || agent.byonPhoneNumber || agent.phoneNumber || process.env.DEFAULT_FROM_NUMBER || '';

  const tag = {
    agentId: agent._id.toString(),
    shopDomain,
    direction: 'outbound',
    callType: 'event_driven',
    eventType,
    configId,
    ...(template ? { templateId: template._id.toString() } : {}),
    orderContext: JSON.stringify(orderContext),
  };

  try {
    const callPayload: Record<string, unknown> = {
      application_sid: process.env.VOICENIMBLE_APPLICATION_SID,
      from,
      to: { type: 'phone', number: customerPhone },
      tag,
      call_hook: { url: `${appUrl}/voicenimble/call-event`, method: 'POST' },
      call_status_hook: { url: `${appUrl}/voicenimble/call-status`, method: 'POST' },
    };

    if (sipTrunk?.voiceNimbleCarrierSid) {
      callPayload.voip_carrier_sid = sipTrunk.voiceNimbleCarrierSid;
    }

    await axios.post(
      `${baseUrl}/v1/Accounts/${accountSid}/Calls`,
      callPayload,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    logger.info(`Event-driven call initiated: ${eventType} → ${customerPhone} (order: ${(orderContext as { orderName?: string }).orderName || 'N/A'})`);
  } catch (err) {
    logger.error(`Event-driven call failed for ${customerPhone}:`, err);
  }
}

function getBullMQConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    connection: {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      db: parseInt(parsed.pathname?.replace('/', '') || '0', 10) || 0,
    },
  };
}

export async function startWorkers(): Promise<void> {
  const connection = getBullMQConnection();

  const analyticsWorker = new Worker('analytics', processAnalyticsJob, connection);
  const emailWorker = new Worker('email', processEmailJob, connection);
  const broadcastWorker = new Worker('broadcast', processBroadcastJob, connection);
  const eventDrivenWorker = new Worker('event-driven', processEventDrivenJob, connection);

  analyticsWorker.on('completed', (job) => {
    logger.info(`Analytics job ${job.id} completed`);
  });

  analyticsWorker.on('failed', (job, err) => {
    logger.error(`Analytics job ${job?.id} failed:`, err);
  });

  emailWorker.on('completed', (job) => {
    logger.info(`Email job ${job.id} completed`);
  });

  emailWorker.on('failed', (job, err) => {
    logger.error(`Email job ${job?.id} failed:`, err);
  });

  broadcastWorker.on('completed', (job) => {
    logger.info(`Broadcast job ${job.id} completed`);
  });

  broadcastWorker.on('failed', (job, err) => {
    logger.error(`Broadcast job ${job?.id} failed:`, err);
  });

  eventDrivenWorker.on('completed', (job) => {
    logger.info(`Event-driven job ${job.id} completed`);
  });

  eventDrivenWorker.on('failed', (job, err) => {
    logger.error(`Event-driven job ${job?.id} failed:`, err);
  });

  // Poll for scheduled broadcasts every 30 seconds
  setInterval(async () => {
    try {
      const { broadcastQueue } = await import('./queues');
      const now = new Date();
      const pendingBroadcasts = await Broadcast.find({
        status: 'pending',
        $or: [
          { scheduledAt: { $lte: now } },
          { scheduledAt: { $exists: false } },
          { scheduledAt: null },
        ],
      });

      for (const b of pendingBroadcasts) {
        await broadcastQueue.add('execute-broadcast', { broadcastId: b._id.toString() }, {
          jobId: `broadcast-${b._id.toString()}`,
        });
        logger.info(`Queued broadcast ${b._id} for execution`);
      }
    } catch (err) {
      logger.error('Broadcast scheduler error:', err);
    }
  }, 30000);

  logger.info('BullMQ workers started: analytics, email, broadcast, event-driven');
}
