import nodemailer from 'nodemailer';
import dayjs from 'dayjs';
import NotificationSettings from '../models/notification.model';
import Call from '../models/call.model';
import CallTranscript from '../models/call-transcript.model';
import Shop from '../models/shop.model';
import logger from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export class EmailService {
  async sendCallCompletedNotification(callId: string, shopDomain: string): Promise<void> {
    const settings = await NotificationSettings.findOne({ shopDomain });
    if (!settings?.sendPerCallNotification || !settings.notificationEmail || !settings.isEmailVerified) return;

    const [call, shop] = await Promise.all([
      Call.findById(callId),
      Shop.findOne({ shopDomain }),
    ]);

    if (!call || !shop) return;

    let transcriptText = '';
    if (settings.includeTranscript && call.hasTranscript) {
      const transcript = await CallTranscript.findOne({ callId });
      if (transcript) transcriptText = transcript.fullText;
    }

    const duration = call.duration
      ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s`
      : 'N/A';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5C6AC4; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">📞 Call Completed - Voice Nimble</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="color: #333; font-size: 16px;">Call Summary for ${shop.shopName}</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Date</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${dayjs(call.createdAt).format('MMM D, YYYY h:mm A')}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">From</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${call.callerNumber}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Duration</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${duration}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Status</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${call.status}</td></tr>
            ${settings.includeSentimentAnalysis ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Sentiment</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${call.sentiment}</td></tr>` : ''}
            ${call.wasTransferred ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Transferred To</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${call.transferredTo}</td></tr>` : ''}
            ${settings.includeRecordingLink && call.recordingUrl ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Recording</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="${call.recordingUrl}">Listen to Recording</a></td></tr>` : ''}
          </table>
          ${transcriptText ? `
            <h3 style="color: #333; font-size: 14px;">Call Transcript</h3>
            <pre style="background: #f5f5f5; padding: 15px; border-radius: 4px; font-size: 12px; white-space: pre-wrap; overflow-wrap: break-word;">${transcriptText}</pre>
          ` : ''}
          <p style="color: #999; font-size: 12px; margin-top: 20px;">Voice Nimble - AI Phone Agent for Shopify</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: settings.notificationEmail,
      subject: `📞 Call from ${call.callerNumber} — ${shop.shopName}`,
      html,
    });

    logger.info(`Call notification email sent for call ${callId}`);
  }

  async sendVerificationEmail(shopDomain: string, email: string, token: string): Promise<void> {
    const verifyUrl = `${process.env.APP_URL}/api/notifications/verify-email?token=${token}&shop=${shopDomain}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5C6AC4; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Verify Your Email - Voice Nimble</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px;">
          <p>Click the button below to verify your notification email address:</p>
          <a href="${verifyUrl}" style="display: inline-block; background: #5C6AC4; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; margin: 16px 0;">Verify Email</a>
          <p style="color: #999; font-size: 12px;">This link expires in 24 hours.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: 'Verify your notification email — Voice Nimble',
      html,
    });
  }

  async sendDailySummaryEmail(shopDomain: string): Promise<void> {
    const settings = await NotificationSettings.findOne({ shopDomain });
    if (!settings?.sendDailySummary || !settings.notificationEmail || !settings.isEmailVerified) return;

    const today = dayjs().format('YYYY-MM-DD');
    const calls = await Call.find({
      shopDomain,
      createdAt: { $gte: dayjs().startOf('day').toDate() },
    });

    const shop = await Shop.findOne({ shopDomain });
    if (!shop) return;

    const totalCalls = calls.length;
    const completedCalls = calls.filter((c) => c.status === 'completed').length;
    const avgDuration = totalCalls > 0
      ? calls.reduce((sum, c) => sum + c.duration, 0) / totalCalls
      : 0;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5C6AC4; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">📊 Daily Summary — ${today}</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="color: #333; font-size: 16px;">${shop.shopName} — Voice Nimble Daily Report</h2>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px;">
            <div style="text-align: center; padding: 16px; background: #f5f5f5; border-radius: 8px;">
              <div style="font-size: 32px; font-weight: bold; color: #5C6AC4;">${totalCalls}</div>
              <div style="color: #666; font-size: 12px;">Total Calls</div>
            </div>
            <div style="text-align: center; padding: 16px; background: #f5f5f5; border-radius: 8px;">
              <div style="font-size: 32px; font-weight: bold; color: #108043;">${completedCalls}</div>
              <div style="color: #666; font-size: 12px;">Completed</div>
            </div>
            <div style="text-align: center; padding: 16px; background: #f5f5f5; border-radius: 8px;">
              <div style="font-size: 32px; font-weight: bold; color: #333;">${Math.round(avgDuration)}s</div>
              <div style="color: #666; font-size: 12px;">Avg Duration</div>
            </div>
          </div>
          <p style="color: #999; font-size: 12px;">Voice Nimble - AI Phone Agent for Shopify</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: settings.notificationEmail,
      subject: `📊 Daily Summary ${today} — ${shop.shopName}`,
      html,
    });
  }
}
