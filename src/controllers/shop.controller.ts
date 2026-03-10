import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import Shop from '../models/shop.model';
import { ShopifyService } from '../services/shopify.service';
import { AppError } from '../middlewares/error.middleware';

export class ShopController {
  async getShop(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const shop = await Shop.findById(req.shopId).select('-accessToken');
      if (!shop) throw new AppError('Shop not found', 404);
      res.json({ success: true, shop });
    } catch (error) {
      next(error);
    }
  }

  async syncShopData(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const shop = await Shop.findById(req.shopId);
      if (!shop) throw new AppError('Shop not found', 404);

      const shopifyService = new ShopifyService(req.shopDomain!, req.accessToken!);
      await shopifyService.syncShopData(req.shopId!);

      const updated = await Shop.findById(req.shopId).select('-accessToken');
      res.json({ success: true, shop: updated });
    } catch (error) {
      next(error);
    }
  }

  async getProducts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopifyService = new ShopifyService(req.shopDomain!, req.accessToken!);
      const { products, nextPageInfo } = await shopifyService.getProducts(
        50,
        req.query.page_info as string | undefined,
      );
      res.json({ success: true, products, nextPageInfo });
    } catch (error) {
      next(error);
    }
  }

  async getPolicies(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const shopifyService = new ShopifyService(req.shopDomain!, req.accessToken!);
      const policies = await shopifyService.getPolicies();
      res.json({ success: true, policies });
    } catch (error) {
      next(error);
    }
  }
}
