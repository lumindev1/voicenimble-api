import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './error.middleware';
import Shop from '../models/shop.model';

export interface AuthRequest extends Request {
  shopDomain?: string;
  shopId?: string;
  accessToken?: string;
}

export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new AppError('No token provided', 401);

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      shopDomain: string;
      shopId: string;
    };

    const shop = await Shop.findById(decoded.shopId);
    if (!shop || !shop.isActive) throw new AppError('Shop not found or inactive', 401);

    req.shopDomain = decoded.shopDomain;
    req.shopId = decoded.shopId;
    req.accessToken = shop.accessToken;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token', 401));
    } else {
      next(error);
    }
  }
}
