import { NextResponse } from "next/server";
import { isResendConfigured, sendWelcomeEmail } from "@/lib/resend/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.email) return NextResponse.json({ error: "A signed-in email is required." }, { status: 401 });
    if (!isResendConfigured()) {
      return NextResponse.json({
        sent: false,
        message: "Welcome email delivery is disabled.",
      });
    }
    await sendWelcomeEmail(data.user.email);
    return NextResponse.json({ sent: true, message: "Welcome email sent." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Welcome email could not be sent." }, { status: 500 });
  }
}
