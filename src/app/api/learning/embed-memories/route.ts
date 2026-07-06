import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/embeddings";

/**
 * Backfills embeddings for memories that don't have one yet
 * (e.g. rows created before pgvector was enabled).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: rows } = await supabase
    .from("user_memories")
    .select("id, content")
    .eq("user_id", user.id)
    .is("embedding", null)
    .limit(50);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ embedded: 0 });
  }

  try {
    const embeddings = await embedTexts(rows.map((r) => r.content));
    let embedded = 0;
    for (let i = 0; i < rows.length; i++) {
      const { error } = await supabase
        .from("user_memories")
        .update({ embedding: embeddings[i] })
        .eq("id", rows[i].id);
      if (!error) embedded++;
    }
    return NextResponse.json({ embedded });
  } catch (e) {
    console.error("embed-memories failed:", e);
    return NextResponse.json(
      { error: "埋め込みの生成に失敗しました" },
      { status: 502 }
    );
  }
}
