import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { createProxyMiddleware } from 'http-proxy-middleware';

import authRoutes from './routes/auth.routes';
import shopRoutes from './routes/shop.routes';
import agentRoutes from './routes/agent.routes';
import callRoutes from './routes/call.routes';
import analyticsRoutes from './routes/analytics.routes';
import billingRoutes from './routes/billing.routes';
import skillsRoutes from './routes/skills.routes';
import notificationRoutes from './routes/notification.routes';
import webhookRoutes from './routes/webhook.routes';
import jambonzRoutes from './routes/jambonz.routes';
import contactRoutes from './routes/contact.routes';
import templateRoutes from './routes/template.routes';
import knowledgeBaseRoutes from './routes/knowledge-base.routes';
import broadcastRoutes from './routes/broadcast.routes';
import eventDrivenRoutes from './routes/event-driven.routes';
import testCallRoutes from './routes/test-call.routes';

import { errorHandler } from './middlewares/error.middleware';
import logger from './utils/logger';

const app: Application = express();

// Trust proxy (required when behind Cloudflare / reverse proxy)
app.set('trust proxy', 1);

// Cookies (needed for Shopify OAuth state)
app.use(cookieParser());

// Security
app.use(helmet({ contentSecurityPolicy: false, frameguard: false }));

// CORS - allow Shopify admin iframe
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://admin.shopify.com',
      process.env.APP_URL || '',
      'http://localhost:3000',
    ];
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing - raw for webhooks BEFORE json parser
app.use('/webhooks', express.raw({ type: 'application/json' }));
app.use('/jambonz', express.urlencoded({ extended: true }));
app.use('/jambonz', express.json());

// Standard body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));
}

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'voice-nimble-api', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/knowledge-base', knowledgeBaseRoutes);
app.use('/api/broadcast', broadcastRoutes);
app.use('/api/event-driven', eventDrivenRoutes);
app.use('/api/test-call', testCallRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/jambonz', jambonzRoutes);

// Proxy everything else to Vite frontend in development
if (process.env.NODE_ENV !== 'production') {
  app.use('/', createProxyMiddleware({
    target: 'http://localhost:3000',
    changeOrigin: true,
    ws: true,
  }));
} else {
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });
}

// Error handler
app.use(errorHandler);

export default app;
