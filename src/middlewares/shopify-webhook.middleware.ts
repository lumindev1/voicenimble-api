import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppError } from './error.middleware';

export function verifyShopifyWebhook(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const hmac = req.headers['x-shopify-hmac-sha256'] as string;
  const body = req.body as Buffer;

  if (!hmac || !body) {
    next(new AppError('Missing HMAC or body', 401));
    return;
  }

  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET!)
    .update(body)
    .digest('base64');

  if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac))) {
    next(new AppError('Invalid webhook signature', 401));
    return;
  }

  next();
}
