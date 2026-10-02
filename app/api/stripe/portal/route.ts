import { NextResponse } from "next/server";
import { getStripeClient, getStripeCheckoutConfig } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    const { data: subscription, error: subscriptionError } = await client
      .from("workspace_subscriptions")
      .select("stripe_customer_id")
      .eq("workspace_id", workspaceId)
      .single();
    if (subscriptionError) throw subscriptionError;
    if (!subscription.stripe_customer_id) return NextResponse.json({ error: "This workspace does not have a Stripe customer yet." }, { status: 409 });

    const { appUrl } = getStripeCheckoutConfig();
    const session = await getStripeClient().billingPortal.sessions.create({ customer: subscription.stripe_customer_id, return_url: `${appUrl}/` });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Billing portal could not be opened." }, { status: 500 });
  }
}
