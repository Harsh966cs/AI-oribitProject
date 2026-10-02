import { NextResponse } from "next/server";
import { isResendConfigured, sendInvitationEmail } from "@/lib/resend/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    const body = await request.json() as { email?: unknown; workspaceId?: unknown; role?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const role = body.role === "admin" || body.role === "member" ? body.role : null;
    if (!email || !workspaceId || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid invitation email, workspace, and role." }, { status: 400 });
    }
    const { data: membership, error: membershipError } = await client.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", data.user.id).single();
    if (membershipError) throw membershipError;
    if (membership.role !== "owner" && membership.role !== "admin") return NextResponse.json({ error: "Only workspace owners and admins can send invitations." }, { status: 403 });
    const [{ data: workspace, error: workspaceError }, { data: invitation, error: invitationError }] = await Promise.all([
      client.from("workspaces").select("name").eq("id", workspaceId).single(),
      client.from("workspace_invitations").select("role").eq("workspace_id", workspaceId).eq("email", email.toLowerCase()).eq("status", "pending").single(),
    ]);
    if (workspaceError) throw workspaceError;
    if (invitationError && invitationError.code !== "PGRST116") throw invitationError;
    if (!invitation) {
      const { error: invitationInsertError } = await client.from("workspace_invitations").insert({
        workspace_id: workspaceId,
        email,
        role,
        invited_by: data.user.id,
      });
      if (invitationInsertError) {
        if (invitationInsertError.code === "23505") {
          return NextResponse.json({ error: "A pending invitation already exists for this email." }, { status: 409 });
        }
        throw invitationInsertError;
      }
    } else if (invitation.role !== role) {
      return NextResponse.json({ error: "A pending invitation already exists with another role." }, { status: 409 });
    }
    if (!isResendConfigured()) {
      return NextResponse.json({
        sent: false,
        message: "Invitation created. Email delivery is disabled; share the sign-in link with the invitee.",
      });
    }
    await sendInvitationEmail(email, workspace.name, role);
    return NextResponse.json({ sent: true, message: "Invitation created and email sent." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invitation email could not be sent." }, { status: 500 });
  }
}
