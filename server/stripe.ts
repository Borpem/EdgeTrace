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
let cancellationPortalConfigurationId: string | null = null;

export function isStripeConfigured() {
  return Boolean(envValue("STRIPE_SECRET_KEY") && envValue("STRIPE_PRO_PRICE_ID"));
}

export function isStripeWebhookConfigured() {
  return Boolean(envValue("STRIPE_SECRET_KEY") && envValue("STRIPE_WEBHOOK_SECRET"));
}

function getStripe() {
  const secretKey = envValue("STRIPE_SECRET_KEY");
  if (!secretKey) {
    throw new Error("Stripe is not configured in this environment.");
  }

  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
}

function priceIdForPlan(planId: PlanId) {
  if (planId === "pro") return envValue("STRIPE_PRO_PRICE_ID");
  if (planId === "advanced") return envValue("STRIPE_ADVANCED_PRICE_ID");
  return undefined;
}

export function mapStripePriceToPlan(priceId: string | null | undefined): PlanId {
  const normalizedPriceId = priceId?.trim();
  if (normalizedPriceId && normalizedPriceId === envValue("STRIPE_PRO_PRICE_ID")) return "pro";
  if (normalizedPriceId && normalizedPriceId === envValue("STRIPE_ADVANCED_PRICE_ID")) return "advanced";
  return "free";
}

type BillingPortalReference = {
  customerId: string;
  subscriptionId?: string;
};

async function resolveSubscriptionCustomerId(
  stripe: InstanceType<typeof Stripe>,
  subscriptionId: string | undefined,
  userId: string
) {
  if (!subscriptionId) return "";

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId = subscriptionCustomerId(subscription);
    if (!customerId) return "";

    await updateUserPlanFromSubscription(subscription, userId);
    return customerId;
  } catch (err) {
    if (isMissingStripeResource(err)) {
      console.warn(`[stripe] Saved subscription ${subscriptionId} for user=${userId} was not found.`);
      return "";
    }
    throw err;
  }
}

async function resolveBillingPortalReference(
  stripe: InstanceType<typeof Stripe>,
  userId: string
): Promise<BillingPortalReference> {
  const profile = await getOrCreateUserProfile(userId);

  if (profile.stripeSubscriptionId) {
    const customerId = await resolveSubscriptionCustomerId(stripe, profile.stripeSubscriptionId, userId);
    if (customerId) {
      return { customerId, subscriptionId: profile.stripeSubscriptionId };
    }
  }

  if (!profile.stripeCustomerId) {
    throw new Error("No Stripe customer exists for this account yet.");
  }

  try {
    await retrieveLiveCustomer(stripe, profile.stripeCustomerId);
    return {
      customerId: profile.stripeCustomerId,
      subscriptionId: profile.stripeSubscriptionId || undefined
    };
  } catch (err) {
    if (isMissingStripeResource(err)) {
      throw new Error("Stripe could not find a live customer or subscription linked to this account.");
    }
    throw err;
  }
}

async function retrieveLiveCustomer(stripe: InstanceType<typeof Stripe>, customerId: string) {
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer && customer.deleted) {
    const err = new Error("Stripe customer was deleted.");
    (err as { code?: string }).code = "resource_missing";
    throw err;
  }
  return customer;
}

function subscriptionCustomerId(subscription: any) {
  return typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? "";
}

function isMissingStripeResource(err: unknown) {
  const details = stripeErrorDetails(err);
  return details.code === "resource_missing" || /No such (customer|subscription)/i.test(details.message);
}

function stripeErrorDetails(err: unknown) {
  if (!err || typeof err !== "object") return { code: "", message: "" };
  const input = err as {
    code?: string;
    message?: string;
    raw?: { code?: string; message?: string };
  };
  return {
    code: input.code ?? input.raw?.code ?? "",
    message: input.message ?? input.raw?.message ?? ""
  };
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

export async function getOrCreateStripeCustomer(userId: string) {
  const stripe = getStripe();
  const profile = await getOrCreateUserProfile(userId);
  const subscriptionCustomerId = await resolveSubscriptionCustomerId(stripe, profile.stripeSubscriptionId, userId);
  if (subscriptionCustomerId) return subscriptionCustomerId;

  if (profile.stripeCustomerId) {
    try {
      await retrieveLiveCustomer(stripe, profile.stripeCustomerId);
      return profile.stripeCustomerId;
    } catch (err) {
      if (!isMissingStripeResource(err)) throw err;
      console.warn(`[stripe] Saved customer ${profile.stripeCustomerId} for user=${userId} was not found. Creating a new customer.`);
    }
  }

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
    throw new Error("Pro is the current self-serve review plan.");
  }

  const stripe = getStripe();
  const priceId = priceIdForPlan(planId);
  if (!priceId) {
    throw new Error("The selected plan is missing a Stripe price ID.");
  }

  console.info(`[stripe] Creating checkout session user=${userId} plan=${planId} price=${priceId}.`);
  const customerId = await getOrCreateStripeCustomer(userId);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
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
  console.info(`[stripe] Created checkout session ${session.id} for user=${userId}.`);
  return session;
}

export async function createBillingPortalSession(userId: string, origin: string) {
  if (!envValue("STRIPE_SECRET_KEY")) {
    throw new Error("Billing is not configured in this environment.");
  }

  const stripe = getStripe();
  const billingReference = await resolveBillingPortalReference(stripe, userId);

  return stripe.billingPortal.sessions.create({
    customer: billingReference.customerId,
    return_url: `${origin}/pricing`
  });
}

async function getCancellationPortalConfigurationId(stripe: InstanceType<typeof Stripe>, origin: string) {
  if (cancellationPortalConfigurationId) return cancellationPortalConfigurationId;

  const purpose = "subscription_cancel_at_period_end";
  const existingConfigurations = await stripe.billingPortal.configurations.list({
    active: true,
    limit: 100
  });
  const existing = existingConfigurations.data.find(
    (configuration) => configuration.metadata?.edgeTracePurpose === purpose
  );
  if (existing) {
    cancellationPortalConfigurationId = existing.id;
    return cancellationPortalConfigurationId;
  }

  const configuration = await stripe.billingPortal.configurations.create({
    name: "EdgeTrace cancellation flow",
    default_return_url: `${origin}/app/account`,
    business_profile: {
      headline: "Manage your EdgeTrace subscription"
    },
    features: {
      invoice_history: {
        enabled: true
      },
      payment_method_update: {
        enabled: true
      },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
        cancellation_reason: {
          enabled: true,
          options: ["too_expensive", "missing_features", "unused", "other"]
        }
      }
    },
    metadata: {
      edgeTracePurpose: purpose
    }
  });

  cancellationPortalConfigurationId = configuration.id;
  return cancellationPortalConfigurationId;
}

export async function createSubscriptionCancellationSession(userId: string, origin: string) {
  if (!envValue("STRIPE_SECRET_KEY")) {
    throw new Error("Billing is not configured in this environment.");
  }

  const stripe = getStripe();
  const billingReference = await resolveBillingPortalReference(stripe, userId);
  if (!billingReference.subscriptionId) {
    throw new Error("No Stripe subscription is linked to this account yet.");
  }

  const returnUrl = `${origin}/app/account?billing=cancelled`;
  return stripe.billingPortal.sessions.create({
    customer: billingReference.customerId,
    configuration: await getCancellationPortalConfigurationId(stripe, origin),
    return_url: returnUrl,
    flow_data: {
      type: "subscription_cancel",
      subscription_cancel: {
        subscription: billingReference.subscriptionId
      },
      after_completion: {
        type: "redirect",
        redirect: {
          return_url: returnUrl
        }
      }
    }
  });
}

export async function syncUserBillingFromStripe(userId: string) {
  const profile = await getOrCreateUserProfile(userId);
  if (!envValue("STRIPE_SECRET_KEY") || !profile.stripeSubscriptionId) return profile;

  try {
    const subscription = await getStripe().subscriptions.retrieve(profile.stripeSubscriptionId);
    return (await updateUserPlanFromSubscription(subscription, userId)) ?? profile;
  } catch (err) {
    console.warn(`[stripe] Unable to sync subscription ${profile.stripeSubscriptionId} for user=${userId}.`, err);
    return profile;
  }
}

export function constructStripeWebhookEvent(rawBody: Buffer, signature: string | string[] | undefined) {
  const webhookSecret = envValue("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret is not configured.");
  }

  const sig = Array.isArray(signature) ? signature[0] : signature;
  if (!sig) {
    throw new Error("Missing Stripe signature.");
  }

  return getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
}

export async function updateUserPlanFromSubscription(subscription: any, fallbackUserId?: string) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) {
    console.warn(`[stripe] Subscription ${subscription.id ?? "unknown"} did not include a customer id.`);
    return null;
  }

  let profile = await getUserProfileByStripeCustomerId(customerId);
  const metadataUserId = firstString(subscription.metadata?.edgeTraceUserId, subscription.metadata?.userId);
  const userId = profile?.userId || fallbackUserId || metadataUserId;
  if (!profile) {
    if (!userId) {
      console.warn(`[stripe] No EdgeTrace profile found for Stripe customer ${customerId}.`);
      return null;
    }
    await setStripeCustomerId(userId, customerId);
    profile = await getOrCreateUserProfile(userId);
  } else if (fallbackUserId && profile.userId === fallbackUserId && profile.stripeCustomerId !== customerId) {
    profile = await setStripeCustomerId(fallbackUserId, customerId);
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
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);

  const updated = await updateUserBillingState(profile.userId, {
    planId,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status,
    stripeCancelAtPeriodEnd: cancelAtPeriodEnd,
    stripePriceId: priceId,
    currentPeriodEnd: currentPeriodEndSeconds
      ? new Date(currentPeriodEndSeconds * 1000).toISOString()
      : ""
  });
  console.info(`[stripe] Updated billing profile for customer ${customerId}: plan=${planId}, status=${subscription.status}, cancelAtPeriodEnd=${cancelAtPeriodEnd}.`);
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

export async function confirmCheckoutSessionForUser(userId: string, sessionId: string) {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const sessionUserId = session.metadata?.edgeTraceUserId || session.metadata?.userId || session.client_reference_id;
  if (sessionUserId && sessionUserId !== userId) {
    throw new Error("Checkout session does not belong to the current user.");
  }

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (customerId) {
    const profile = await getOrCreateUserProfile(userId);
    if (profile.stripeCustomerId && profile.stripeCustomerId !== customerId) {
      throw new Error("Checkout customer does not match the current account.");
    }
    await setStripeCustomerId(userId, customerId);
  }

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) {
    throw new Error("Checkout session has not created a subscription yet.");
  }

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const updated = await updateUserPlanFromSubscription(subscription);
  if (!updated || updated.userId !== userId) {
    throw new Error("Checkout session could not update the current account.");
  }

  await trackUserEvent(userId, {
    eventName: "checkout_completed",
    properties: {
      planId: updated.planId,
      stripeSubscriptionStatus: updated.stripeSubscriptionStatus,
      source: "checkout_return_confirmation"
    }
  });
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

function envValue(key: string) {
  return process.env[key]?.trim() ?? "";
}
