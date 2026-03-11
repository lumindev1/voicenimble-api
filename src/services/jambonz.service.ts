import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

interface JambonzApplication {
  name: string;
  call_webhook: { url: string; method: string };
  call_status_webhook: { url: string; method: string };
}

interface JambonzPhoneNumber {
  number: string;
  number_type: string;
  country_code: string;
  sip_realm?: string;
}

export class JambonzService {
  private readonly client: AxiosInstance;
  private readonly accountSid: string;

  constructor() {
    this.accountSid = process.env.JAMBONZ_ACCOUNT_SID!;
    this.client = axios.create({
      baseURL: process.env.JAMBONZ_BASE_URL,
      headers: {
        Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
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
    const payload: JambonzApplication = {
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

  async getApplication(appSid: string): Promise<JambonzApplication & { sid: string }> {
    const res = await this.client.get(
      `/v1/Accounts/${this.accountSid}/Applications/${appSid}`,
    );
    return res.data;
  }

  async updateApplication(appSid: string, data: Partial<JambonzApplication>): Promise<void> {
    await this.client.put(
      `/v1/Accounts/${this.accountSid}/Applications/${appSid}`,
      data,
    );
  }

  async deleteApplication(appSid: string): Promise<void> {
    await this.client.delete(
      `/v1/Accounts/${this.accountSid}/Applications/${appSid}`,
    );
  }

  async getAvailablePhoneNumbers(countryCode = 'US'): Promise<JambonzPhoneNumber[]> {
    try {
      const res = await this.client.get(
        `/v1/Accounts/${this.accountSid}/PhoneNumbers?in_use=false&country=${countryCode}`,
      );
      return res.data?.phone_numbers || [];
    } catch (err) {
      logger.error('Failed to get Jambonz phone numbers:', err);
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
    // Jambonz call transfer - redirect the call to a new target
    await this.client.put(
      `/v1/Accounts/${this.accountSid}/Calls/${callSid}`,
      {
        redirect_url: `${process.env.APP_URL}/jambonz/transfer-webhook`,
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

  // ---- SIP Trunk / Carrier Management ----

  async createCarrier(name: string, description?: string): Promise<string> {
    const res = await this.client.post('/v1/VoipCarriers', {
      name,
      description: description || '',
      account_sid: this.accountSid,
    });
    return res.data.sid;
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

  // Build Jambonz JCML (call control JSON) for saying something via TTS
  buildSayVerb(
    text: string,
    voiceId = 'en-US-Standard-F',
    synthesizer = 'google',
    speed = 1.0,
  ): Record<string, unknown> {
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

  // Build Jambonz JCML for gathering speech input
  buildGatherVerb(
    actionUrl: string,
    hints: string[] = [],
    timeout = 10,
    language = 'en-US',
  ): Record<string, unknown> {
    return {
      verb: 'gather',
      actionHook: actionUrl,
      input: ['speech'],
      timeout,
      recognizer: {
        vendor: 'google',
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
      callerId: process.env.JAMBONZ_CALLER_ID || '+10000000000',
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
      recordingStatusCallback: `${process.env.APP_URL}/jambonz/recording-status`,
      recordingStatusCallbackMethod: 'POST',
      trim: 'trim-silence',
      playBeep: false,
    };
  }
}
