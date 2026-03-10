import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

const authService = new AuthService();

export class AuthController {
  async install(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { shop } = req.query;
      if (!shop || typeof shop !== 'string') {
        res.status(400).json({ success: false, message: 'Missing shop parameter' });
        return;
      }
      await authService.generateAuthUrl(shop, req, res);
    } catch (error) {
      next(error);
    }
  }

  async callback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.handleCallback(req, res);
      const redirectUrl = `${process.env.APP_URL}/?shop=${result.shop}&token=${result.token}`;
      res.redirect(redirectUrl);
    } catch (error) {
      next(error);
    }
  }

  async exchangeToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionToken, shop } = req.body;
      if (!sessionToken || !shop) {
        res.status(400).json({ success: false, message: 'Missing sessionToken or shop' });
        return;
      }
      const token = await authService.exchangeSessionToken(sessionToken, shop);
      res.json({ success: true, token });
    } catch (error) {
      next(error);
    }
  }

  async logout(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }
}
