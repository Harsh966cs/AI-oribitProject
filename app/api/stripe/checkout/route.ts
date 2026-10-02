import { NextResponse } from "next/server";
import { getStripeClient, getStripeCheckoutConfig } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const client = await createSupabaseServerClient();
    const { data: userResult, error: userError } = await client.auth.getUser();
    if (userError || !userResult.user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const { data: membership, error: membershipError } = await client
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userResult.user.id)
      .single();
    if (membershipError) throw membershipError;
    if (membership.role !== "owner" && membership.role !== "admin") {
      return NextResponse.json({ error: "Only workspace owners and admins can manage billing." }, { status: 403 });
    }

    const { data: workspace, error: workspaceError } = await client.from("workspaces").select("name").eq("id", workspaceId).single();
    if (workspaceError) throw workspaceError;
    const { data: subscription, error: subscriptionError } = await client
      .from("workspace_subscriptions")
      .select("stripe_customer_id,stripe_subscription_id,status")
      .eq("workspace_id", workspaceId)
      .single();
    if (subscriptionError) throw subscriptionError;
    if (subscription.stripe_subscription_id && ["incomplete", "trialing", "active", "past_due"].includes(subscription.status)) {
      return NextResponse.json({ error: "This workspace already has a Stripe subscription." }, { status: 409 });
    }

    const stripe = getStripeClient();
    const { priceId, appUrl } = getStripeCheckoutConfig();
    const customerId = subscription.stripe_customer_id ?? (await stripe.customers.create({ name: workspace.name, metadata: { workspace_id: workspaceId } })).id;
    if (customerId !== subscription.stripe_customer_id) {
      const admin = createSupabaseAdminClient();
      const { error } = await admin.from("workspace_subscriptions").update({ stripe_customer_id: customerId }).eq("workspace_id", workspaceId);
      if (error) throw error;
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?billing=success`,
      cancel_url: `${appUrl}/?billing=cancelled`,
      subscription_data: { metadata: { workspace_id: workspaceId } },
      metadata: { workspace_id: workspaceId },
    }, { idempotencyKey: `orbit-checkout-${workspaceId}-${Math.floor(Date.now() / 300000)}` });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Checkout could not be created." }, { status: 500 });
  }
}
