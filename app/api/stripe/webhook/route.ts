import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  let eventId: string | null = null;
  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
    const payload = await request.text();
    const webhookSecret = getStripeWebhookSecret();
    let event: Stripe.Event;
    try {
      event = getStripeClient().webhooks.constructEvent(payload, signature, webhookSecret);
    } catch {
      return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
    }

    eventId = event.id;
    admin = createSupabaseAdminClient();
    const { data: existing, error: existingError } = await admin
      .from("stripe_webhook_events")
      .select("id,processing_status")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.processing_status === "processed") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (existing) {
      const { data: claimed, error: claimError } = await admin
        .from("stripe_webhook_events")
        .update({ processing_status: "processing" })
        .eq("id", existing.id)
        .eq("processing_status", "pending")
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return NextResponse.json({ received: false, retry: true }, { status: 409 });
    } else {
      const { error: eventError } = await admin.from("stripe_webhook_events").insert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event as unknown as Record<string, unknown>,
        processing_status: "processing",
      });
      if (eventError) throw eventError;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspace_id;
      if (workspaceId) {
        const { error } = await admin.from("workspace_subscriptions").update({ stripe_customer_id: typeof session.customer === "string" ? session.customer : null, stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null }).eq("workspace_id", workspaceId);
        if (error) throw error;
      }
    }
    if (event.type.startsWith("customer.subscription.")) {
      const subscription = event.data.object as Stripe.Subscription;
      const workspaceId = subscription.metadata.workspace_id;
      if (workspaceId) {
        const status = subscription.status as "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "unpaid";
        const entitled = ["trialing", "active", "past_due"].includes(status);
        const { error } = await admin.from("workspace_subscriptions").update({
          stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : null,
          stripe_subscription_id: subscription.id,
          plan: entitled ? "pro" : "lite",
          status,
          current_period_end: subscription.items.data[0]?.current_period_end
            ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
            : null,
          cancel_at_period_end: subscription.cancel_at_period_end,
        }).eq("workspace_id", workspaceId);
        if (error) throw error;
      }
    }
    const { error: processedError } = await admin
      .from("stripe_webhook_events")
      .update({ processing_status: "processed", processed_at: new Date().toISOString() })
      .eq("stripe_event_id", event.id);
    if (processedError) throw processedError;
    return NextResponse.json({ received: true });
  } catch (error) {
    if (admin && eventId) {
      await admin
        .from("stripe_webhook_events")
        .update({ processing_status: "pending", processed_at: null })
        .eq("stripe_event_id", eventId)
        .eq("processing_status", "processing");
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Stripe webhook processing failed." }, { status: 500 });
  }
}
