import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import Analytics from '../models/analytics.model';
import Call from '../models/call.model';
import Agent from '../models/agent.model';
import CallTemplate from '../models/call-template.model';
import Broadcast from '../models/broadcast.model';
import Contact from '../models/contact.model';
import dayjs from 'dayjs';

export class AnalyticsController {
  async getDashboard(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopId = req.shopId;
      const now = dayjs();
      const thirtyDaysAgo = now.subtract(30, 'day').toDate();

      const [totalCalls, recentCalls, todayAnalytics, monthData, totalAgents, totalTemplates, totalBroadcast, totalContacts] = await Promise.all([
        Call.countDocuments({ shopId }),
        Call.countDocuments({ shopId, createdAt: { $gte: thirtyDaysAgo } }),
        Analytics.findOne({ shopId, date: now.format('YYYY-MM-DD') }),
        Analytics.find({
          shopId,
          date: { $gte: now.subtract(30, 'day').format('YYYY-MM-DD') },
        }).sort({ date: 1 }),
        Agent.countDocuments({ shopId }),
        CallTemplate.countDocuments({ shopId }),
        Broadcast.countDocuments({ shopId }),
        Contact.countDocuments({ shopId }),
      ]);

      const avgDuration = await Call.aggregate([
        { $match: { shopId: req.shopId, status: 'completed' } },
        { $group: { _id: null, avg: { $avg: '$duration' } } },
      ]);

      // Campaign overview: successful = completed, failed = failed, others = transferred+no-answer+busy
      const [successCalls, failedCalls, otherCalls] = await Promise.all([
        Call.countDocuments({ shopId, status: 'completed' }),
        Call.countDocuments({ shopId, status: 'failed' }),
        Call.countDocuments({ shopId, status: { $in: ['transferred', 'no-answer', 'busy'] } }),
      ]);

      res.json({
        success: true,
        dashboard: {
          // Campaign overview
          totalCalls,
          successCalls,
          failedCalls,
          otherCalls,
          recentCalls,
          averageDuration: avgDuration[0]?.avg || 0,
          // Today
          todayCalls: todayAnalytics?.totalCalls || 0,
          todayPositive: todayAnalytics?.positiveSentiment || 0,
          todayNegative: todayAnalytics?.negativeSentiment || 0,
          // Total records
          totalAgents,
          totalTemplates,
          totalBroadcast,
          totalContacts,
          dailyTrend: monthData.map((d) => ({
            date: d.date,
            calls: d.totalCalls,
            duration: d.averageDuration,
            positive: d.positiveSentiment,
            negative: d.negativeSentiment,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getDailyStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const date = (req.query.date as string) || dayjs().format('YYYY-MM-DD');
      const analytics = await Analytics.findOne({ shopId: req.shopId, date });
      res.json({ success: true, analytics: analytics || { date, totalCalls: 0 } });
    } catch (error) {
      next(error);
    }
  }

  async getWeeklyReport(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const endDate = dayjs();
      const startDate = endDate.subtract(7, 'day');
      const data = await Analytics.find({
        shopId: req.shopId,
        date: { $gte: startDate.format('YYYY-MM-DD'), $lte: endDate.format('YYYY-MM-DD') },
      }).sort({ date: 1 });

      const summary = data.reduce(
        (acc, d) => ({
          totalCalls: acc.totalCalls + d.totalCalls,
          totalDuration: acc.totalDuration + d.totalDuration,
          positive: acc.positive + d.positiveSentiment,
          negative: acc.negative + d.negativeSentiment,
          minutesBilled: acc.minutesBilled + d.minutesBilled,
        }),
        { totalCalls: 0, totalDuration: 0, positive: 0, negative: 0, minutesBilled: 0 },
      );

      res.json({ success: true, summary, daily: data });
    } catch (error) {
      next(error);
    }
  }

  async getMonthlyReport(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const month = (req.query.month as string) || dayjs().format('YYYY-MM');
      const startDate = `${month}-01`;
      const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');

      const data = await Analytics.find({
        shopId: req.shopId,
        date: { $gte: startDate, $lte: endDate },
      }).sort({ date: 1 });

      const summary = data.reduce(
        (acc, d) => ({
          totalCalls: acc.totalCalls + d.totalCalls,
          totalDuration: acc.totalDuration + d.totalDuration,
          positive: acc.positive + d.positiveSentiment,
          negative: acc.negative + d.negativeSentiment,
          minutesBilled: acc.minutesBilled + d.minutesBilled,
          totalCost: acc.totalCost + d.totalCost,
        }),
        { totalCalls: 0, totalDuration: 0, positive: 0, negative: 0, minutesBilled: 0, totalCost: 0 },
      );

      res.json({ success: true, month, summary, daily: data });
    } catch (error) {
      next(error);
    }
  }
}
