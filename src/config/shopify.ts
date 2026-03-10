import { shopifyApi, LATEST_API_VERSION, LogSeverity } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';

export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: (process.env.SHOPIFY_SCOPES || '').split(','),
  hostName: process.env.SHOPIFY_HOST!,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
  logger: {
    level: process.env.NODE_ENV === 'production' ? LogSeverity.Error : LogSeverity.Debug,
  },
});

export default shopify;
