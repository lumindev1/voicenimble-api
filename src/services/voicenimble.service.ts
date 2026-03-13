import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

interface VoiceNimbleApplication {
  name: string;
  call_webhook: { url: string; method: string };
  call_status_webhook: { url: string; method: string };
}

interface VoiceNimblePhoneNumber {
  number: string;
  number_type: string;
  country_code: string;
  sip_realm?: string;
}

export class VoiceNimbleService {
  private readonly client: AxiosInstance;
  private readonly accountSid: string;

  constructor() {
    this.accountSid = process.env.VOICENIMBLE_ACCOUNT_SID!;
    this.client = axios.create({
      baseURL: process.env.VOICENIMBLE_BASE_URL,
      headers: {
        Authorization: `Bearer ${process.env.VOICENIMBLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  async createApplication(
    name: string,
    callStatusWebhookUrl: string,
    callEventWebhookUrl: string,
    shopDomain: string,
  ): Promise<string> {
    const payload: VoiceNimbleApplication = {
      name: `VoiceNimble-${shopDomain}-${name}`,
      call_webhook: {
        url: callEventWebhookUrl,
        method: 'POST',
      },
      call_status_webhook: {
        url: callStatusWebhookUrl,
        method: 'POST',
      },
    };

    const res = await this.client.post(
      `/v1/Accounts/${this.accountSid}/Applications`,
      payload,
    );
    return res.data.sid;
  }

  async getApplication(appSid: string): Promise<VoiceNimbleApplication & { sid: string }> {
    const res = await this.client.get(
      `/v1/Accounts/${this.accountSid}/Applications/${appSid}`,
    );
    return res.data;
  }

  async updateApplication(appSid: string, data: Partial<VoiceNimbleApplication>): Promise<void> {
    await this.client.put(
      `/v1/Applications/${appSid}`,
      data,
    );
  }

  async deleteApplication(appSid: string): Promise<void> {
    await this.client.delete(
      `/v1/Accounts/${this.accountSid}/Applications/${appSid}`,
    );
  }

  async getAvailablePhoneNumbers(countryCode = 'US'): Promise<VoiceNimblePhoneNumber[]> {
    try {
      const res = await this.client.get(
        `/v1/Accounts/${this.accountSid}/PhoneNumbers?in_use=false&country=${countryCode}`,
      );
      return res.data?.phone_numbers || [];
    } catch (err) {
      logger.error('Failed to get VoiceNimble phone numbers:', err);
      return [];
    }
  }

  async provisionPhoneNumber(
    phoneNumber: string,
    applicationSid?: string,
  ): Promise<string> {
    const res = await this.client.post(
      `/v1/Accounts/${this.accountSid}/PhoneNumbers`,
      {
        number: phoneNumber,
        ...(applicationSid && { application_sid: applicationSid }),
      },
    );
    return res.data.sid;
  }

  async assignPhoneNumberToApp(phoneSid: string, appSid: string): Promise<void> {
    await this.client.put(
      `/v1/Accounts/${this.accountSid}/PhoneNumbers/${phoneSid}`,
      { application_sid: appSid },
    );
  }

  async transferCall(callSid: string, transferTo: string): Promise<void> {
    // VoiceNimble call transfer - redirect the call to a new target
    await this.client.put(
      `/v1/Accounts/${this.accountSid}/Calls/${callSid}`,
      {
        redirect_url: `${process.env.APP_URL}/voicenimble/transfer-webhook`,
        transfer_to: transferTo,
      },
    );
  }

  async hangupCall(callSid: string): Promise<void> {
    await this.client.put(
      `/v1/Accounts/${this.accountSid}/Calls/${callSid}`,
      { call_status: 'completed' },
    );
  }

  // ---- Speech Credentials Management ----

  async addElevenLabsSpeechCredential(): Promise<string> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

    // Check if credential already exists
    const existing = await this.listSpeechCredentials();
    const elevenLabsCred = existing.find(
      (c: Record<string, unknown>) => c.vendor === 'elevenlabs',
    );
    if (elevenLabsCred) {
      return elevenLabsCred.speech_credential_sid as string;
    }

    const res = await this.client.post(
      `/v1/Accounts/${this.accountSid}/SpeechCredentials`,
      {
        vendor: 'elevenlabs',
        api_key: apiKey,
        use_for_tts: true,
        use_for_stt: false,
      },
    );
    return res.data.sid;
  }

  async listSpeechCredentials(): Promise<Record<string, unknown>[]> {
    try {
      const res = await this.client.get(
        `/v1/Accounts/${this.accountSid}/SpeechCredentials`,
      );
      return res.data || [];
    } catch {
      return [];
    }
  }

  // ---- SIP Trunk / Carrier Management ----

  async createCarrier(
    name: string,
    description?: string,
    credentials?: {
      username?: string;
      password?: string;
      realm?: string;
    },
  ): Promise<string> {
    const payload: Record<string, unknown> = {
      name,
      description: description || '',
      account_sid: this.accountSid,
    };

    // SIP trunk registration credentials (needed for carriers that require auth)
    if (credentials?.username && credentials?.password) {
      payload.register_username = credentials.username;
      payload.register_password = credentials.password;
      payload.register_sip_realm = credentials.realm || '';
    }

    const res = await this.client.post('/v1/VoipCarriers', payload);
    return res.data.sid;
  }

  async updateCarrier(
    carrierSid: string,
    credentials: {
      username?: string;
      password?: string;
      realm?: string;
    },
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (credentials.username) payload.register_username = credentials.username;
    if (credentials.password) payload.register_password = credentials.password;
    if (credentials.realm) payload.register_sip_realm = credentials.realm;

    await this.client.put(`/v1/VoipCarriers/${carrierSid}`, payload);
  }

  async deleteCarrier(carrierSid: string): Promise<void> {
    await this.client.delete(`/v1/VoipCarriers/${carrierSid}`);
  }

  async createSipGateway(
    carrierSid: string,
    sipHost: string,
    sipPort: number,
    protocol: 'udp' | 'tcp' | 'tls' = 'udp',
  ): Promise<string> {
    const res = await this.client.post('/v1/SipGateways', {
      voip_carrier_sid: carrierSid,
      ipv4: sipHost,
      port: sipPort,
      protocol,
      is_active: true,
      outbound: true,
      inbound: true,
    });
    return res.data.sid;
  }

  async deleteSipGateway(gatewaySid: string): Promise<void> {
    await this.client.delete(`/v1/SipGateways/${gatewaySid}`);
  }

  async updateSipGateway(
    gatewaySid: string,
    sipHost: string,
    sipPort: number,
    protocol: 'udp' | 'tcp' | 'tls' = 'udp',
  ): Promise<void> {
    await this.client.put(`/v1/SipGateways/${gatewaySid}`, {
      ipv4: sipHost,
      port: sipPort,
      protocol,
    });
  }

  // Build JCML (call control JSON) for saying something via TTS
  buildSayVerb(
    text: string,
    voiceId = 'en-US-Standard-F',
    synthesizer = 'google',
    speed = 1.0,
  ): Record<string, unknown> {
    if (synthesizer === 'elevenlabs') {
      const appUrl = process.env.APP_URL || 'https://caren-auld-johnsie.ngrok-free.dev';
      const ttsUrl = `${appUrl}/voicenimble/tts/elevenlabs?voice=${encodeURIComponent(voiceId)}&text=${encodeURIComponent(text)}`;
      return {
        verb: 'play',
        url: ttsUrl,
      };
    }

    return {
      verb: 'say',
      text,
      synthesizer: {
        vendor: synthesizer,
        language: voiceId.split('-').slice(0, 2).join('-'),
        voice: voiceId,
      },
      ...(speed !== 1.0 && { rate: `${speed * 100 - 100}%` }),
    };
  }

  // Build JCML for gathering speech input
  buildGatherVerb(
    actionUrl: string,
    hints: string[] = [],
    timeout = 10,
    language = 'en-US',
    sttVendor = 'google',
  ): Record<string, unknown> {
    return {
      verb: 'gather',
      actionHook: actionUrl,
      input: ['speech'],
      timeout,
      recognizer: {
        vendor: sttVendor,
        language,
        hints,
        hintsBoost: 10,
      },
    };
  }

  // Build transfer JCML
  buildTransferVerb(phoneNumber: string): Record<string, unknown> {
    return {
      verb: 'dial',
      callerId: process.env.VOICENIMBLE_CALLER_ID || '+10000000000',
      target: [
        {
          type: 'phone',
          number: phoneNumber,
        },
      ],
    };
  }

  // Build call recording verb
  buildRecordVerb(actionUrl: string): Record<string, unknown> {
    return {
      verb: 'record',
      action: actionUrl,
      recordingStatusCallback: `${process.env.APP_URL}/voicenimble/recording-status`,
      recordingStatusCallbackMethod: 'POST',
      trim: 'trim-silence',
      playBeep: false,
    };
  }
}
