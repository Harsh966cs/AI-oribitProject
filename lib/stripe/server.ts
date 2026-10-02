import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

export function getStripeCheckoutConfig() {
  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!priceId || !appUrl) {
    throw new Error("Stripe checkout configuration is incomplete. Set STRIPE_PRO_PRICE_ID and NEXT_PUBLIC_APP_URL.");
  }
  return { priceId, appUrl };
}

export function getStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Stripe webhook configuration is incomplete. Set STRIPE_WEBHOOK_SECRET.");
  }
  return webhookSecret;
}
