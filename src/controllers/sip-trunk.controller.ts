import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import SipTrunk from '../models/sip-trunk.model';
import { JambonzService } from '../services/jambonz.service';
import { AppError } from '../middlewares/error.middleware';
import logger from '../utils/logger';

const jambonz = new JambonzService();

export class SipTrunkController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const trunks = await SipTrunk.find({ shopId: req.shopId }).sort({ isDefault: -1, createdAt: -1 });
      res.json({ success: true, trunks });
    } catch (error) {
      next(error);
    }
  }

  async getOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const trunk = await SipTrunk.findOne({ _id: req.params.trunkId, shopId: req.shopId });
      if (!trunk) throw new AppError('SIP trunk not found', 404);
      res.json({ success: true, trunk });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, description, sipHost, sipPort, sipProtocol, sipUsername, sipPassword, sipRealm, callerIdNumber, callerIdName } = req.body;

      if (!name || !sipHost || !callerIdNumber) {
        throw new AppError('Name, SIP host, and caller ID number are required', 400);
      }

      // Create carrier in Jambonz
      const carrierName = `VN-${req.shopDomain}-${name}`.replace(/[^a-zA-Z0-9-_]/g, '-');
      let jambonzCarrierSid: string | undefined;
      let jambonzGatewaySid: string | undefined;

      try {
        jambonzCarrierSid = await jambonz.createCarrier(carrierName, description);
        jambonzGatewaySid = await jambonz.createSipGateway(
          jambonzCarrierSid,
          sipHost,
          sipPort || 5060,
          sipProtocol || 'udp',
        );
        logger.info(`Created Jambonz carrier ${jambonzCarrierSid} + gateway ${jambonzGatewaySid} for ${req.shopDomain}`);
      } catch (err) {
        logger.error('Failed to create Jambonz carrier/gateway:', err);
        // Clean up if partial creation
        if (jambonzCarrierSid) {
          try { await jambonz.deleteCarrier(jambonzCarrierSid); } catch { /* ignore */ }
        }
        throw new AppError('Failed to register SIP trunk with phone system', 500);
      }

      // If this is the first trunk, make it default
      const existingCount = await SipTrunk.countDocuments({ shopId: req.shopId });

      const trunk = await SipTrunk.create({
        shopId: req.shopId,
        shopDomain: req.shopDomain,
        name,
        description,
        sipHost,
        sipPort: sipPort || 5060,
        sipProtocol: sipProtocol || 'udp',
        sipUsername,
        sipPassword,
        sipRealm,
        callerIdNumber,
        callerIdName,
        jambonzCarrierSid,
        jambonzGatewaySid,
        isDefault: existingCount === 0,
      });

      res.status(201).json({ success: true, trunk });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const trunk = await SipTrunk.findOne({ _id: req.params.trunkId, shopId: req.shopId });
      if (!trunk) throw new AppError('SIP trunk not found', 404);

      const { name, description, sipHost, sipPort, sipProtocol, callerIdNumber, callerIdName } = req.body;

      // Update Jambonz gateway if SIP host changed
      if (trunk.jambonzGatewaySid && (sipHost || sipPort || sipProtocol)) {
        try {
          await jambonz.updateSipGateway(
            trunk.jambonzGatewaySid,
            sipHost || trunk.sipHost,
            sipPort || trunk.sipPort,
            sipProtocol || trunk.sipProtocol,
          );
        } catch (err) {
          logger.error('Failed to update Jambonz gateway:', err);
          throw new AppError('Failed to update SIP trunk with phone system', 500);
        }
      }

      const updated = await SipTrunk.findByIdAndUpdate(
        trunk._id,
        {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(sipHost && { sipHost }),
          ...(sipPort && { sipPort }),
          ...(sipProtocol && { sipProtocol }),
          ...(callerIdNumber && { callerIdNumber }),
          ...(callerIdName !== undefined && { callerIdName }),
        },
        { new: true },
      );

      res.json({ success: true, trunk: updated });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const trunk = await SipTrunk.findOne({ _id: req.params.trunkId, shopId: req.shopId });
      if (!trunk) throw new AppError('SIP trunk not found', 404);

      // Delete from Jambonz
      if (trunk.jambonzGatewaySid) {
        try { await jambonz.deleteSipGateway(trunk.jambonzGatewaySid); } catch { /* ignore */ }
      }
      if (trunk.jambonzCarrierSid) {
        try { await jambonz.deleteCarrier(trunk.jambonzCarrierSid); } catch { /* ignore */ }
      }

      await SipTrunk.findByIdAndDelete(trunk._id);

      // If deleted trunk was default, set another as default
      if (trunk.isDefault) {
        const next = await SipTrunk.findOne({ shopId: req.shopId });
        if (next) {
          next.isDefault = true;
          await next.save();
        }
      }

      res.json({ success: true, message: 'SIP trunk deleted' });
    } catch (error) {
      next(error);
    }
  }

  async setDefault(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const trunk = await SipTrunk.findOne({ _id: req.params.trunkId, shopId: req.shopId });
      if (!trunk) throw new AppError('SIP trunk not found', 404);

      // Unset all defaults for this shop
      await SipTrunk.updateMany({ shopId: req.shopId }, { isDefault: false });

      trunk.isDefault = true;
      await trunk.save();

      res.json({ success: true, trunk });
    } catch (error) {
      next(error);
    }
  }
}
