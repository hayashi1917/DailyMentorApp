import type { SupabaseClient } from "@supabase/supabase-js";
import { embedMemoryRow } from "@/lib/embeddings";
import type { MemoryType } from "@/lib/types";

/**
 * user_memories への upsert。同一内容の記憶があれば evidence を積み上げ、
 * なければ新規作成して埋め込みも付与する。保存できたら true。
 */
export async function upsertUserMemory(
  supabase: SupabaseClient,
  userId: string,
  memoryType: MemoryType,
  content: string,
  initialConfidence = 0.5,
  initialEvidenceCount = 1
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("user_memories")
    .select("id, confidence, evidence_count")
    .eq("user_id", userId)
    .eq("memory_type", memoryType)
    .eq("content", content)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("user_memories")
      .update({
        evidence_count: existing.evidence_count + 1,
        confidence: Math.min(0.95, Number(existing.confidence) + 0.1),
        last_observed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return !error;
  }

  const { data: inserted, error } = await supabase
    .from("user_memories")
    .insert({
      user_id: userId,
      memory_type: memoryType,
      content,
      confidence: initialConfidence,
      evidence_count: initialEvidenceCount,
    })
    .select("id")
    .single();

  if (error || !inserted) return false;
  await embedMemoryRow(supabase, inserted.id, content);
  return true;
}
