import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import NotificationSettings from '../models/notification.model';
import { EmailService } from '../services/email.service';
import { AppError } from '../middlewares/error.middleware';
import crypto from 'crypto';
import dayjs from 'dayjs';

const emailService = new EmailService();

export class NotificationController {
  async getSettings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await NotificationSettings.findOne({ shopId: req.shopId });
      if (!settings) throw new AppError('Settings not found', 404);
      res.json({ success: true, settings });
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { notificationEmail, ...rest } = req.body;

      const existing = await NotificationSettings.findOne({ shopId: req.shopId });

      // If email changed, reset verification
      const emailChanged = existing?.notificationEmail !== notificationEmail;

      const settings = await NotificationSettings.findOneAndUpdate(
        { shopId: req.shopId },
        {
          ...rest,
          ...(notificationEmail !== undefined && {
            notificationEmail,
            ...(emailChanged && { isEmailVerified: false }),
          }),
        },
        { new: true },
      );
      res.json({ success: true, settings });
    } catch (error) {
      next(error);
    }
  }

  async sendVerification(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await NotificationSettings.findOne({ shopId: req.shopId });
      if (!settings?.notificationEmail) {
        throw new AppError('No notification email set', 400);
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expires = dayjs().add(24, 'hour').toDate();

      settings.emailVerificationToken = token;
      settings.emailVerificationExpires = expires;
      await settings.save();

      await emailService.sendVerificationEmail(req.shopDomain!, settings.notificationEmail, token);

      res.json({ success: true, message: 'Verification email sent' });
    } catch (error) {
      next(error);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, shop } = req.query;
      if (!token || !shop) throw new AppError('Missing token or shop', 400);

      const settings = await NotificationSettings.findOne({
        shopDomain: shop as string,
        emailVerificationToken: token as string,
        emailVerificationExpires: { $gt: new Date() },
      });

      if (!settings) throw new AppError('Invalid or expired token', 400);

      settings.isEmailVerified = true;
      settings.emailVerificationToken = undefined;
      settings.emailVerificationExpires = undefined;
      await settings.save();

      res.redirect(`${process.env.APP_URL}/?shop=${shop}&email_verified=true`);
    } catch (error) {
      next(error);
    }
  }
}
