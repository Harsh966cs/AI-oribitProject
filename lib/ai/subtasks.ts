import type { Task } from "@/lib/orbit";

export type SubtaskSuggestion = {
  title: string;
};

const MAX_SUGGESTIONS = 5;

function normalizeSuggestions(value: unknown): SubtaskSuggestion[] {
  if (!Array.isArray(value)) throw new Error("The AI provider returned an invalid suggestion list.");
  const suggestions = value
    .map((item) => typeof item === "string" ? item : typeof item === "object" && item !== null && "title" in item && typeof item.title === "string" ? item.title : "")
    .map((title) => title.trim())
    .filter(Boolean)
    .slice(0, MAX_SUGGESTIONS);
  if (suggestions.length === 0) throw new Error("The AI provider returned no usable suggestions.");
  return suggestions.map((title) => ({ title }));
}

function mockSuggestions(task: Pick<Task, "title" | "description">): SubtaskSuggestion[] {
  const subject = task.title.replace(/[.!?]+$/, "").trim();
  return normalizeSuggestions([
    `Clarify the outcome for ${subject}`,
    `Break ${subject.toLowerCase()} into the smallest deliverable`,
    `Review the result with the team`,
  ]);
}

async function ollamaSuggestions(task: Pick<Task, "title" | "description">): Promise<SubtaskSuggestion[]> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL ?? "llama3.2";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        prompt: [
          "Return JSON only in this shape: {\"subtasks\":[{\"title\":\"...\"}]}",
          "Suggest 3 to 5 concrete, short subtasks for this task.",
          `Task title: ${task.title}`,
          `Task description: ${task.description || "No description provided."}`,
        ].join("\n"),
      }),
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
    const payload = await response.json() as { response?: string };
    if (!payload.response) throw new Error("Ollama returned an empty response.");
    const parsed: unknown = JSON.parse(payload.response);
    if (typeof parsed === "object" && parsed !== null && "subtasks" in parsed) {
      return normalizeSuggestions(parsed.subtasks);
    }
    return normalizeSuggestions(parsed);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The local AI provider timed out. Check that Ollama is running and try again.");
    }
    throw error instanceof Error ? error : new Error("The local AI provider could not be reached.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function suggestSubtasks(task: Pick<Task, "title" | "description">): Promise<SubtaskSuggestion[]> {
  if (process.env.AI_PROVIDER === "ollama") return ollamaSuggestions(task);
  return mockSuggestions(task);
}
