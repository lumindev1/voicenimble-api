import { Request, Response, NextFunction } from 'express';
import { VoiceNimbleWebhookService } from '../services/voicenimble-webhook.service';

const webhookService = new VoiceNimbleWebhookService();

/**
 * Normalize incoming webhook payloads from different providers.
 * Twilio sends PascalCase fields (CallSid, To, From, CallStatus),
 * VoiceNimble sends snake_case fields (call_sid, to, from, call_status).
 * This function converts Twilio format to VoiceNimble format.
 */
function normalizePayload(raw: Record<string, unknown>): Record<string, unknown> {
  // If payload already has call_sid, it's VoiceNimble format — return as-is
  if (raw.call_sid) return raw;

  // Twilio format detected — normalize to VoiceNimble format
  if (raw.CallSid) {
    return {
      ...raw,
      call_sid: raw.CallSid,
      to: raw.To || raw.Called,
      from: raw.From || raw.Caller,
      call_status: raw.CallStatus,
      direction: raw.Direction || (String(raw.Direction || '').includes('outbound') ? 'outbound' : 'inbound'),
      duration: raw.CallDuration ? Number(raw.CallDuration) : undefined,
      // Preserve customerData/tag if present
      customerData: raw.customerData,
      tag: raw.tag,
    };
  }

  return raw;
}

export class VoiceNimbleWebhookController {
  async handleCallEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const raw = { ...req.body, ...req.query };
      const payload = normalizePayload(raw);
      const jcml = await webhookService.handleIncomingCall(payload as any);
      res.json(jcml);
    } catch (error) {
      next(error);
    }
  }

  async handleCallStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = normalizePayload(req.body);
      await webhookService.handleCallStatus(payload as any);
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
      const raw = { ...req.body, ...req.query };
      // Normalize recording fields: Twilio uses RecordingUrl, VoiceNimble may use recording_url
      const payload: Record<string, string> = {
        callSid: String(raw.callSid || raw.CallSid || raw.call_sid || ''),
        RecordingUrl: String(raw.RecordingUrl || raw.recording_url || ''),
        RecordingDuration: String(raw.RecordingDuration || raw.recording_duration || '0'),
        RecordingSid: String(raw.RecordingSid || raw.recording_sid || ''),
      };
      await webhookService.handleRecordingComplete(payload);
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
