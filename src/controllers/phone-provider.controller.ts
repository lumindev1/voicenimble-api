import { Response, NextFunction } from 'express';
import axios from 'axios';
import { AuthRequest } from '../middlewares/auth.middleware';
import PhoneProvider from '../models/phone-provider.model';
import SipTrunk from '../models/sip-trunk.model';
import { VoiceNimbleService } from '../services/voicenimble.service';
import { AppError } from '../middlewares/error.middleware';
import logger from '../utils/logger';

const voiceNimble = new VoiceNimbleService();

export class PhoneProviderController {
  // Get connected provider for this shop
  async get(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providers = await PhoneProvider.find({ shopId: req.shopId });
      res.json({ success: true, providers });
    } catch (error) {
      next(error);
    }
  }

  // Connect a provider (validate credentials)
  async connect(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider, accountSid, authToken } = req.body;

      if (!provider || !accountSid || !authToken) {
        throw new AppError('Provider, Account SID, and Auth Token are required', 400);
      }

      if (provider !== 'twilio' && provider !== 'telnyx' && provider !== 'vonage') {
        throw new AppError('Unsupported provider. Use: twilio, telnyx, or vonage', 400);
      }

      // Validate credentials and fetch existing numbers
      let existingNumbers: Array<{
        number: string;
        sid: string;
        friendlyName: string;
        isDefault: boolean;
        capabilities: { voice: boolean; sms: boolean };
        purchasedAt: Date;
      }> = [];

      if (provider === 'twilio') {
        try {
          // Validate credentials
          await axios.get(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
            { auth: { username: accountSid, password: authToken } },
          );

          // Fetch existing phone numbers from Twilio
          const numbersRes = await axios.get(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
            { auth: { username: accountSid, password: authToken } },
          );

          existingNumbers = (numbersRes.data.incoming_phone_numbers || []).map((n: {
            phone_number: string;
            sid: string;
            friendly_name: string;
            capabilities: { voice: boolean; sms: boolean };
            date_created: string;
          }, i: number) => ({
            number: n.phone_number,
            sid: n.sid,
            friendlyName: n.friendly_name,
            isDefault: i === 0,
            capabilities: { voice: n.capabilities?.voice || false, sms: n.capabilities?.sms || false },
            purchasedAt: new Date(n.date_created),
          }));

          logger.info(`Found ${existingNumbers.length} existing Twilio numbers`);
        } catch (err: unknown) {
          const axiosErr = err as { response?: { status?: number } };
          if (axiosErr.response?.status === 401) {
            throw new AppError('Invalid Twilio credentials. Please check your Account SID and Auth Token.', 400);
          }
          throw new AppError('Failed to connect to Twilio', 400);
        }
      }

      // Auto-create Jambonz carrier + SIP gateway + SIP trunks for each number
      // This makes calls work immediately without any manual setup
      for (const num of existingNumbers) {
        try {
          // Check if SIP trunk already exists for this number
          const existingTrunk = await SipTrunk.findOne({ shopId: req.shopId, callerIdNumber: num.number });
          if (existingTrunk) continue;

          const sipHost = provider === 'twilio'
            ? `${accountSid}.pstn.twilio.com`
            : provider === 'telnyx' ? 'sip.telnyx.com' : 'sip.vonage.com';

          const carrierName = `${provider}-${req.shopDomain}-${num.number}`.replace(/[^a-zA-Z0-9-_+]/g, '-');

          // Create carrier in Jambonz
          const carrierSid = await voiceNimble.createCarrier(carrierName, `Auto-created for ${num.number} via ${provider}`, {
            username: provider === 'twilio' ? accountSid : undefined,
            password: provider === 'twilio' ? authToken : undefined,
          });

          // Create SIP gateway in Jambonz
          const gatewaySid = await voiceNimble.createSipGateway(carrierSid, sipHost, 5060, 'udp');

          // Create SIP trunk in our database
          const isFirst = await SipTrunk.countDocuments({ shopId: req.shopId }) === 0;
          await SipTrunk.create({
            shopId: req.shopId,
            shopDomain: req.shopDomain,
            name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} - ${num.friendlyName}`,
            description: `Auto-configured from ${provider}`,
            sipHost,
            sipPort: 5060,
            sipProtocol: 'udp',
            callerIdNumber: num.number,
            callerIdName: req.shopDomain?.split('.')[0] || '',
            voiceNimbleCarrierSid: carrierSid,
            voiceNimbleGatewaySid: gatewaySid,
            isActive: true,
            isDefault: num.isDefault || isFirst,
          });

          logger.info(`Auto-configured SIP trunk for ${num.number} via ${provider} (carrier: ${carrierSid}, gateway: ${gatewaySid})`);
        } catch (err) {
          logger.error(`Failed to auto-configure SIP trunk for ${num.number}:`, err);
        }
      }

      // Upsert provider
      const existing = await PhoneProvider.findOne({ shopId: req.shopId, provider });
      if (existing) {
        existing.accountSid = accountSid;
        existing.authToken = authToken;
        existing.isConnected = true;
        existing.connectedAt = new Date();
        existing.phoneNumbers = existingNumbers;
        await existing.save();
        res.json({ success: true, provider: existing, message: `${provider} connected! ${existingNumbers.length} number(s) ready to use.` });
      } else {
        const newProvider = await PhoneProvider.create({
          shopId: req.shopId,
          shopDomain: req.shopDomain,
          provider,
          accountSid,
          authToken,
          isConnected: true,
          connectedAt: new Date(),
          phoneNumbers: existingNumbers,
        });
        res.status(201).json({ success: true, provider: newProvider, message: `${provider} connected successfully. Found ${existingNumbers.length} phone number(s).` });
      }
    } catch (error) {
      next(error);
    }
  }

  // Disconnect provider
  async disconnect(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { providerId } = req.params;
      const provider = await PhoneProvider.findOne({ _id: providerId, shopId: req.shopId });
      if (!provider) throw new AppError('Provider not found', 404);

      await PhoneProvider.findByIdAndDelete(providerId);
      res.json({ success: true, message: `${provider.provider} disconnected` });
    } catch (error) {
      next(error);
    }
  }

  // Search available phone numbers from provider
  async searchNumbers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { providerId } = req.params;
      const { country = 'US', type = 'local' } = req.query;

      const provider = await PhoneProvider.findOne({ _id: providerId, shopId: req.shopId });
      if (!provider || !provider.isConnected) throw new AppError('Provider not connected', 400);

      let numbers: Array<{ number: string; friendlyName: string; region: string; capabilities: { voice: boolean; sms: boolean }; monthlyPrice: string }> = [];

      if (provider.provider === 'twilio') {
        try {
          const endpoint = type === 'tollfree'
            ? `https://api.twilio.com/2010-04-01/Accounts/${provider.accountSid}/AvailablePhoneNumbers/${country}/TollFree.json?PageSize=20`
            : `https://api.twilio.com/2010-04-01/Accounts/${provider.accountSid}/AvailablePhoneNumbers/${country}/Local.json?PageSize=20`;

          const twilioRes = await axios.get(endpoint, {
            auth: { username: provider.accountSid, password: provider.authToken },
          });

          numbers = (twilioRes.data.available_phone_numbers || []).map((n: {
            phone_number: string;
            friendly_name: string;
            region: string;
            capabilities: { voice: boolean; SMS: boolean };
          }) => ({
            number: n.phone_number,
            friendlyName: n.friendly_name,
            region: n.region || '',
            capabilities: { voice: n.capabilities?.voice || false, sms: n.capabilities?.SMS || false },
            monthlyPrice: '$1.00',
          }));
        } catch (err: unknown) {
          const axiosErr = err as { response?: { data?: { message?: string } } };
          throw new AppError(`Failed to search numbers: ${axiosErr.response?.data?.message || 'Unknown error'}`, 400);
        }
      }

      res.json({ success: true, numbers });
    } catch (error) {
      next(error);
    }
  }

  // Buy a phone number from provider
  async buyNumber(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { providerId } = req.params;
      const { phoneNumber } = req.body;

      if (!phoneNumber) throw new AppError('Phone number is required', 400);

      const provider = await PhoneProvider.findOne({ _id: providerId, shopId: req.shopId });
      if (!provider || !provider.isConnected) throw new AppError('Provider not connected', 400);

      let numberSid = '';
      let friendlyName = phoneNumber;

      if (provider.provider === 'twilio') {
        try {
          const twilioRes = await axios.post(
            `https://api.twilio.com/2010-04-01/Accounts/${provider.accountSid}/IncomingPhoneNumbers.json`,
            `PhoneNumber=${encodeURIComponent(phoneNumber)}`,
            {
              auth: { username: provider.accountSid, password: provider.authToken },
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            },
          );
          numberSid = twilioRes.data.sid;
          friendlyName = twilioRes.data.friendly_name || phoneNumber;
        } catch (err: unknown) {
          const axiosErr = err as { response?: { data?: { message?: string } } };
          throw new AppError(`Failed to buy number: ${axiosErr.response?.data?.message || 'Unknown error'}`, 400);
        }
      }

      // Add to provider's phone numbers
      const isFirst = provider.phoneNumbers.length === 0;
      provider.phoneNumbers.push({
        number: phoneNumber,
        sid: numberSid,
        friendlyName,
        isDefault: isFirst,
        capabilities: { voice: true, sms: true },
        purchasedAt: new Date(),
      });
      await provider.save();

      // Auto-create SIP trunk for this number
      try {
        const carrierName = `${provider.provider}-${phoneNumber}`.replace(/[^a-zA-Z0-9-_+]/g, '-');
        const sipHost = provider.provider === 'twilio'
          ? `${provider.accountSid}.pstn.twilio.com`
          : 'sip.telnyx.com';

        const carrierSid = await voiceNimble.createCarrier(carrierName, `Auto-created for ${phoneNumber} via ${provider.provider}`, {
          username: provider.accountSid,
          password: provider.authToken,
        });

        const gatewaySid = await voiceNimble.createSipGateway(carrierSid, sipHost, 5060, 'udp');

        await SipTrunk.create({
          shopId: req.shopId,
          shopDomain: req.shopDomain,
          name: `${provider.provider.charAt(0).toUpperCase() + provider.provider.slice(1)} - ${friendlyName}`,
          description: `Auto-created from Phone Provider (${provider.provider})`,
          sipHost,
          sipPort: 5060,
          sipProtocol: 'udp',
          callerIdNumber: phoneNumber,
          callerIdName: req.shopDomain?.split('.')[0] || '',
          voiceNimbleCarrierSid: carrierSid,
          voiceNimbleGatewaySid: gatewaySid,
          isActive: true,
          isDefault: isFirst,
        });

        logger.info(`Auto-created SIP trunk for ${phoneNumber} via ${provider.provider}`);
      } catch (err) {
        logger.error('Failed to auto-create SIP trunk:', err);
      }

      res.json({ success: true, message: `Number ${phoneNumber} purchased and configured`, provider });
    } catch (error) {
      next(error);
    }
  }

  // Release a phone number
  async releaseNumber(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { providerId } = req.params;
      const { numberSid } = req.body;

      const provider = await PhoneProvider.findOne({ _id: providerId, shopId: req.shopId });
      if (!provider) throw new AppError('Provider not found', 404);

      const numberEntry = provider.phoneNumbers.find((n) => n.sid === numberSid);
      if (!numberEntry) throw new AppError('Number not found', 404);

      // Release from Twilio
      if (provider.provider === 'twilio') {
        try {
          await axios.delete(
            `https://api.twilio.com/2010-04-01/Accounts/${provider.accountSid}/IncomingPhoneNumbers/${numberSid}.json`,
            { auth: { username: provider.accountSid, password: provider.authToken } },
          );
        } catch {
          logger.error(`Failed to release number from Twilio: ${numberSid}`);
        }
      }

      // Remove from provider
      provider.phoneNumbers = provider.phoneNumbers.filter((n) => n.sid !== numberSid);
      await provider.save();

      // Remove associated SIP trunk
      await SipTrunk.findOneAndDelete({ shopId: req.shopId, callerIdNumber: numberEntry.number });

      res.json({ success: true, message: `Number ${numberEntry.number} released` });
    } catch (error) {
      next(error);
    }
  }

  // Set a number as default
  async setDefaultNumber(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { providerId } = req.params;
      const { numberSid } = req.body;

      const provider = await PhoneProvider.findOne({ _id: providerId, shopId: req.shopId });
      if (!provider) throw new AppError('Provider not found', 404);

      provider.phoneNumbers.forEach((n) => {
        n.isDefault = n.sid === numberSid;
      });
      await provider.save();

      // Also update SIP trunk default
      const defaultNumber = provider.phoneNumbers.find((n) => n.sid === numberSid);
      if (defaultNumber) {
        await SipTrunk.updateMany({ shopId: req.shopId }, { isDefault: false });
        await SipTrunk.findOneAndUpdate(
          { shopId: req.shopId, callerIdNumber: defaultNumber.number },
          { isDefault: true },
        );
      }

      res.json({ success: true, message: 'Default number updated', provider });
    } catch (error) {
      next(error);
    }
  }
}
