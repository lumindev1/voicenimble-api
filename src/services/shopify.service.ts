import axios from 'axios';
import Shop from '../models/shop.model';
import logger from '../utils/logger';

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  handle: string;
  variants: Array<{
    id: number;
    title: string;
    price: string;
    sku: string;
    inventory_quantity: number;
  }>;
  images: Array<{ src: string }>;
  status: string;
}

interface ShopifyOrder {
  id: number;
  name: string;
  email: string;
  phone: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
  created_at: string;
  line_items: Array<{
    title: string;
    quantity: number;
    price: string;
  }>;
  shipping_address?: {
    address1: string;
    city: string;
    province: string;
    country: string;
    zip: string;
  };
  tracking_number?: string;
}

interface ShopifyShopData {
  id: number;
  name: string;
  email: string;
  domain: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  currency: string;
  timezone: string;
  plan_name: string;
  myshopify_domain: string;
}

export class ShopifyService {
  private readonly shopDomain: string;
  private readonly accessToken: string;
  private readonly baseUrl: string;

  constructor(shopDomain: string, accessToken: string) {
    this.shopDomain = shopDomain;
    this.accessToken = accessToken;
    this.baseUrl = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}`;
  }

  private get headers() {
    return {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json',
    };
  }

  async getShopData(): Promise<ShopifyShopData> {
    const res = await axios.get(`${this.baseUrl}/shop.json`, { headers: this.headers });
    return res.data.shop;
  }

  async syncShopData(shopId: string): Promise<void> {
    const shopData = await this.getShopData();
    await Shop.findByIdAndUpdate(shopId, {
      shopName: shopData.name,
      shopEmail: shopData.email,
      shopPhone: shopData.phone || '',
      shopAddress: {
        address1: shopData.address1 || '',
        address2: shopData.address2 || '',
        city: shopData.city || '',
        province: shopData.province || '',
        country: shopData.country || '',
        zip: shopData.zip || '',
      },
      currency: shopData.currency,
      timezone: shopData.timezone,
      planName: shopData.plan_name,
      lastSyncedAt: new Date(),
    });
  }

  async getProducts(limit = 50, pageInfo?: string): Promise<{ products: ShopifyProduct[]; nextPageInfo?: string }> {
    const params = new URLSearchParams({ limit: String(limit), status: 'active' });
    if (pageInfo) params.set('page_info', pageInfo);

    const res = await axios.get(`${this.baseUrl}/products.json?${params}`, {
      headers: this.headers,
    });

    const linkHeader = res.headers.link as string | undefined;
    let nextPageInfo: string | undefined;
    if (linkHeader?.includes('rel="next"')) {
      const match = linkHeader.match(/page_info=([^&>]+).*rel="next"/);
      if (match) nextPageInfo = match[1];
    }

    return { products: res.data.products, nextPageInfo };
  }

  async getProductById(productId: string): Promise<ShopifyProduct> {
    const res = await axios.get(`${this.baseUrl}/products/${productId}.json`, {
      headers: this.headers,
    });
    return res.data.product;
  }

  async searchProducts(query: string): Promise<ShopifyProduct[]> {
    const res = await axios.get(
      `${this.baseUrl}/products.json?title=${encodeURIComponent(query)}&limit=10&status=active`,
      { headers: this.headers },
    );
    return res.data.products;
  }

  async getOrderByName(orderName: string): Promise<ShopifyOrder | null> {
    const name = orderName.startsWith('#') ? orderName : `#${orderName}`;
    const res = await axios.get(
      `${this.baseUrl}/orders.json?name=${encodeURIComponent(name)}&status=any`,
      { headers: this.headers },
    );
    const orders: ShopifyOrder[] = res.data.orders;
    return orders.length > 0 ? orders[0] : null;
  }

  async getOrderById(orderId: string): Promise<ShopifyOrder> {
    const res = await axios.get(`${this.baseUrl}/orders/${orderId}.json`, {
      headers: this.headers,
    });
    return res.data.order;
  }

  async getOrdersByEmail(email: string): Promise<ShopifyOrder[]> {
    const res = await axios.get(
      `${this.baseUrl}/orders.json?email=${encodeURIComponent(email)}&status=any&limit=5`,
      { headers: this.headers },
    );
    return res.data.orders;
  }

  async getOrdersByPhone(phone: string): Promise<ShopifyOrder[]> {
    const res = await axios.get(
      `${this.baseUrl}/orders.json?status=any&limit=10`,
      { headers: this.headers },
    );
    const orders: ShopifyOrder[] = res.data.orders;
    // Filter by phone (Shopify REST doesn't support phone filter directly)
    return orders.filter(
      (o) => o.phone && o.phone.replace(/\D/g, '').includes(phone.replace(/\D/g, '')),
    );
  }

  async getPolicies(): Promise<Array<{ title: string; body: string; url: string }>> {
    const res = await axios.get(`${this.baseUrl}/policies.json`, { headers: this.headers });
    return res.data.policies || [];
  }

  async getPages(): Promise<Array<{ title: string; body_html: string; handle: string }>> {
    const res = await axios.get(`${this.baseUrl}/pages.json?published_status=published`, {
      headers: this.headers,
    });
    return res.data.pages || [];
  }

  async createDraftOrder(lineItems: Array<{ variantId: number; quantity: number }>, customer: { email?: string; phone?: string; firstName?: string; lastName?: string }): Promise<{ id: number; name: string; invoice_url: string }> {
    const body = {
      draft_order: {
        line_items: lineItems.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
        })),
        customer: customer.email ? { email: customer.email } : undefined,
        note: `Order placed via AI phone agent for customer: ${customer.firstName || ''} ${customer.lastName || ''} ${customer.phone || ''}`.trim(),
      },
    };

    const res = await axios.post(`${this.baseUrl}/draft_orders.json`, body, {
      headers: this.headers,
    });
    return res.data.draft_order;
  }

  async getShopSummaryForAI(): Promise<string> {
    try {
      const [shopData, policies] = await Promise.all([
        this.getShopData(),
        this.getPolicies().catch(() => []),
      ]);

      const policyText = policies
        .map((p) => `${p.title}: ${p.body.replace(/<[^>]+>/g, '').substring(0, 500)}`)
        .join('\n\n');

      return `
Store Name: ${shopData.name}
Store Domain: ${shopData.domain}
Store Email: ${shopData.email}
Store Phone: ${shopData.phone || 'Not provided'}
Store Address: ${shopData.address1}, ${shopData.city}, ${shopData.province}, ${shopData.country}
Currency: ${shopData.currency}

STORE POLICIES:
${policyText || 'No policies available'}
      `.trim();
    } catch (err) {
      logger.error('Failed to get shop summary for AI:', err);
      return 'Store information temporarily unavailable.';
    }
  }
}
