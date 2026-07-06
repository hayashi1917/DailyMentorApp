import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpenAI } from "@/lib/openai";

export const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims

export async function embedText(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  });
  return res.data[0].embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const openai = getOpenAI();
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
  });
  return res.data.map((d) => d.embedding);
}

export type MatchedMemory = {
  id: string;
  memory_type: string;
  content: string;
  confidence: number;
  similarity: number;
};

/**
 * Vector search over the user's own memories (RLS + auth.uid() filter
 * inside the SQL function). Best-effort: returns [] on failure so
 * callers can degrade gracefully.
 */
export async function searchRelevantMemories(
  supabase: SupabaseClient,
  query: string,
  matchCount = 5
): Promise<MatchedMemory[]> {
  try {
    const embedding = await embedText(query);
    const { data, error } = await supabase.rpc("match_user_memories", {
      query_embedding: embedding,
      match_count: matchCount,
    });
    if (error) {
      console.error("match_user_memories failed:", error);
      return [];
    }
    return (data ?? []) as MatchedMemory[];
  } catch (e) {
    console.error("searchRelevantMemories failed:", e);
    return [];
  }
}

/**
 * Computes and stores the embedding for a memory row. Best-effort:
 * memories remain usable (by confidence ordering) without embeddings.
 */
export async function embedMemoryRow(
  supabase: SupabaseClient,
  memoryId: string,
  content: string
): Promise<void> {
  try {
    const embedding = await embedText(content);
    await supabase
      .from("user_memories")
      .update({ embedding })
      .eq("id", memoryId);
  } catch (e) {
    console.error("embedMemoryRow failed:", e);
  }
}
