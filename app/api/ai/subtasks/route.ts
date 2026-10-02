import { NextResponse } from "next/server";
import { suggestSubtasks } from "@/lib/ai/subtasks";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RequestBody = { taskId?: unknown };

export async function POST(request: Request) {
  try {
    const body = await request.json() as RequestBody;
    if (typeof body.taskId !== "string" || !body.taskId.trim()) {
      return NextResponse.json({ error: "A task is required." }, { status: 400 });
    }

    const client = await createSupabaseServerClient();
    const { data: userResult, error: userError } = await client.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });
    if (!userResult.user) return NextResponse.json({ error: "You must sign in to use task suggestions." }, { status: 401 });

    const { data: task, error: taskError } = await client
      .from("tasks")
      .select("id,title,description,board_id")
      .eq("id", body.taskId.trim())
      .single();
    if (taskError || !task) return NextResponse.json({ error: "Task not found or unavailable." }, { status: 404 });

    const { data: board, error: boardError } = await client
      .from("boards")
      .select("workspace_id")
      .eq("id", task.board_id)
      .single();
    if (boardError || !board) return NextResponse.json({ error: "Task workspace could not be verified." }, { status: 403 });

    const { data: membership, error: membershipError } = await client
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", board.workspace_id)
      .eq("user_id", userResult.user.id)
      .maybeSingle();
    if (membershipError || !membership) return NextResponse.json({ error: "You cannot use AI suggestions for this task." }, { status: 403 });

    const suggestions = await suggestSubtasks({ title: task.title, description: task.description });
    return NextResponse.json({
      provider: process.env.AI_PROVIDER === "ollama" ? "ollama" : "mock",
      suggestions,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI suggestions could not be generated." }, { status: 503 });
  }
}
