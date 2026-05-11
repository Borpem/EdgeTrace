import Stripe from "stripe";
import type { PlanId } from "../src/lib/plans";
import { normalizePlanId } from "../src/lib/plans";
import {
  getOrCreateUserProfile,
  getUserProfileByStripeCustomerId,
  setStripeCustomerId,
  trackUserEvent,
  updateUserBillingState
} from "./db";

let stripeClient: InstanceType<typeof Stripe> | null = null;

export function isStripeConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRO_PRICE_ID
  );
}

export function isStripeWebhookConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured in this environment.");
  }

  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

function priceIdForPlan(planId: PlanId) {
  if (planId === "pro") return process.env.STRIPE_PRO_PRICE_ID;
  if (planId === "advanced") return process.env.STRIPE_ADVANCED_PRICE_ID;
  return undefined;
}

export function mapStripePriceToPlan(priceId: string | null | undefined): PlanId {
  if (priceId && priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId && priceId === process.env.STRIPE_ADVANCED_PRICE_ID) return "advanced";
  return "free";
}

export async function getOrCreateStripeCustomer(userId: string) {
  const stripe = getStripe();
  const profile = await getOrCreateUserProfile(userId);
  if (profile.stripeCustomerId) return profile.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: profile.email || undefined,
    name: profile.name || undefined,
    metadata: {
      edgeTraceUserId: userId
    }
  });

  await setStripeCustomerId(userId, customer.id);
  return customer.id;
}

export async function createCheckoutSession(userId: string, planId: PlanId, origin: string) {
  if (!isStripeConfigured()) {
    throw new Error("Billing is not configured in this environment.");
  }

  if (planId !== "pro") {
    throw new Error("Advanced is coming soon. Pro is the current self-serve upgrade.");
  }

  const stripe = getStripe();
  const priceId = priceIdForPlan(planId);
  if (!priceId) {
    throw new Error("The selected plan is missing a Stripe price ID.");
  }

  const customerId = await getOrCreateStripeCustomer(userId);
  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/pricing?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    metadata: {
      edgeTraceUserId: userId,
      planId
    },
    subscription_data: {
      metadata: {
        edgeTraceUserId: userId,
        planId
      }
    }
  });
}

export async function createBillingPortalSession(userId: string, origin: string) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Billing is not configured in this environment.");
  }

  const stripe = getStripe();
  const profile = await getOrCreateUserProfile(userId);
  if (!profile.stripeCustomerId) {
    throw new Error("No Stripe customer exists for this account yet.");
  }

  return stripe.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${origin}/pricing`
  });
}

export function constructStripeWebhookEvent(rawBody: Buffer, signature: string | string[] | undefined) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("Stripe webhook secret is not configured.");
  }

  const sig = Array.isArray(signature) ? signature[0] : signature;
  if (!sig) {
    throw new Error("Missing Stripe signature.");
  }

  return getStripe().webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
}

export async function updateUserPlanFromSubscription(subscription: any) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) {
    console.warn(`[stripe] Subscription ${subscription.id ?? "unknown"} did not include a customer id.`);
    return null;
  }

  const profile = await getUserProfileByStripeCustomerId(customerId);
  if (!profile) {
    console.warn(`[stripe] No EdgeTrace profile found for Stripe customer ${customerId}.`);
    return null;
  }

  const priceId = subscription.items.data[0]?.price.id ?? "";
  const active = subscription.status === "active" || subscription.status === "trialing";
  const planId = active ? mapStripePriceToPlan(priceId) : "free";
  if (active && planId === "free") {
    console.warn(`[stripe] Unknown active price id ${priceId || "missing"} for subscription ${subscription.id}. Downgrading to free.`);
  }
  if (!active) {
    console.info(`[stripe] Subscription ${subscription.id} status ${subscription.status}; setting plan to free.`);
  }
  const currentPeriodEndSeconds = subscription.current_period_end as number | undefined;

  const updated = await updateUserBillingState(profile.userId, {
    planId,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status,
    stripePriceId: priceId,
    currentPeriodEnd: currentPeriodEndSeconds
      ? new Date(currentPeriodEndSeconds * 1000).toISOString()
      : ""
  });
  console.info(`[stripe] Updated billing profile for customer ${customerId}: plan=${planId}, status=${subscription.status}.`);
  return updated;
}

export async function handleCheckoutSessionCompleted(session: any) {
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const userId = session.metadata?.edgeTraceUserId || session.metadata?.userId;
  if (userId && customerId) {
    await setStripeCustomerId(userId, customerId);
  }

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) {
    console.warn(`[stripe] Checkout session ${session.id ?? "unknown"} completed without subscription id.`);
    return null;
  }

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const updated = await updateUserPlanFromSubscription(subscription);
  if (updated) {
    await trackUserEvent(updated.userId, {
      eventName: "checkout_completed",
      properties: {
        planId: updated.planId,
        stripeSubscriptionStatus: updated.stripeSubscriptionStatus
      }
    });
  }
  return updated;
}

export async function handleInvoicePaymentFailed(invoice: any) {
  const subscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) {
    console.warn(`[stripe] invoice.payment_failed ${invoice.id ?? "unknown"} did not include a subscription id.`);
    return null;
  }

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  return updateUserPlanFromSubscription(subscription);
}

export function normalizePaidPlan(planId: unknown): PlanId | null {
  const normalized = normalizePlanId(typeof planId === "string" ? planId : undefined);
  return normalized === "pro" ? normalized : null;
}
