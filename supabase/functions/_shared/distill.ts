/**
 * Turning an archive into a memory.
 *
 * Raw items answer "what happened". Facts answer "what is true about this
 * person" — and that second question is the one an assistant actually needs
 * when it opens cold. Distillation reads items that have not been read before
 * and writes short standalone statements that stay true for months.
 *
 * Deliberately conservative: it is far worse for a memory layer to assert
 * something wrong with confidence than to hold fewer facts. The prompt says so,
 * and anything the model returns that does not fit the shape is dropped rather
 * than repaired.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const MODEL = "gemini-2.0-flash";
const BATCH = 40;

export type Fact = {
  statement: string;
  category: string;
};

const CATEGORIES = new Set([
  "identity", "project", "preference", "relationship", "tool", "decision",
]);

const PROMPT = `You are building a long-term memory profile of one person from raw material
gathered out of their connected accounts — commits, emails, documents, messages.

Write short standalone statements that will still be true in six months.

Rules:
- Each statement must stand on its own, with no reference to "this commit" or "the email".
- Prefer what is durable over what is momentary. "Works primarily in TypeScript" is a fact.
  "Fixed a bug on Tuesday" is not.
- Only write what the material actually supports. If you are unsure, leave it out.
  Holding fewer facts is much better than asserting something wrong.
- No more than 12 statements. Fewer is fine. An empty list is fine.
- Never include credentials, tokens, passwords, card or account numbers, or anything
  that reads like a secret, even if it appears in the material.

Categories, use exactly one per statement:
- identity: who they are, their role, how they work
- project: what they are building, and what it is for
- preference: how they like things done
- relationship: who they work with
- tool: languages, frameworks, services they use
- decision: a choice they made, and the reason

Return ONLY a JSON array, no prose and no code fence:
[{"statement": "...", "category": "..."}]`;

/**
 * Ask the model for facts.
 *
 * null means the attempt failed; [] means it succeeded and concluded nothing.
 * Collapsing those two into [] is what let a broken model call mark a batch as
 * read — the items were then skipped forever, with nothing to show for them.
 */
async function extractFacts(material: string): Promise<Fact[] | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("distill: GEMINI_API_KEY not set");
    return null;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${PROMPT}\n\n---\n\n${material}` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
        }),
      },
    );
    if (!res.ok) {
      console.error(`distill: model returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const json = await res.json();
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Models wrap JSON in fences often enough that stripping them is cheaper
    // than a retry, but anything beyond that is treated as a failed run.
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      console.error(`distill: model did not return an array: ${cleaned.slice(0, 200)}`);
      return null;
    }

    return parsed
      .filter((f): f is Fact =>
        f && typeof f.statement === "string" &&
        f.statement.trim().length > 8 && f.statement.length < 400 &&
        typeof f.category === "string" && CATEGORIES.has(f.category))
      .slice(0, 12)
      .map((f) => ({ statement: f.statement.trim(), category: f.category }));
  } catch (err) {
    console.error("distill: extraction failed", err);
    return null;
  }
}

/**
 * Read one batch of undistilled items for a user and store what they imply.
 * Returns what happened, so a caller can log it without inspecting the database.
 */
export async function distillForUser(
  admin: SupabaseClient,
  userId: string,
  maxBatches = 3,
): Promise<{ read: number; written: number }> {
  let read = 0;
  let written = 0;
  // Several batches per run so an account that already holds hundreds of items
  // is caught up in a few passes rather than forty at a time forever. The loop
  // stops the moment a batch comes back empty, so a caught-up user costs one
  // query and no model call at all.
  for (let i = 0; i < maxBatches; i++) {
    const batch = await distillBatch(admin, userId);
    read += batch.read;
    written += batch.written;
    // Nothing left to read, or the attempt failed — either way, stop rather
    // than hammering a model that is not answering.
    if (batch.read === 0 || batch.failed) break;
  }
  return { read, written };
}

async function distillBatch(
  admin: SupabaseClient,
  userId: string,
): Promise<{ read: number; written: number; failed?: boolean }> {
  const { data: items, error } = await admin
    .from("memory_items")
    .select("id, title, content, source_type, occurred_at")
    .eq("user_id", userId)
    .is("distilled_at", null)
    .order("occurred_at", { ascending: false })
    .limit(BATCH);

  if (error) throw new Error(`distill: fetch failed: ${error.message}`);
  if (!items || items.length === 0) return { read: 0, written: 0 };

  const material = items
    .map((it) => `[${it.source_type}] ${it.title ?? ""}\n${(it.content ?? "").slice(0, 900)}`)
    .join("\n\n---\n\n");

  const facts = await extractFacts(material);
  const ids = items.map((it) => it.id);

  // A failed attempt leaves the batch untouched so the next run tries it again.
  // Marking it read would quietly retire material that was never actually
  // considered.
  if (facts === null) return { read: items.length, written: 0, failed: true };

  if (facts.length > 0) {
    // A conclusion drawn twice is one fact confirmed twice, not two rows. The
    // conflict target is statement_key, a stored generated column holding the
    // normalised statement — a functional index cannot be named here.
    const { error: upsertErr } = await admin
      .from("memory_facts")
      .upsert(
        facts.map((f) => ({
          user_id: userId,
          statement: f.statement,
          category: f.category,
          source_item_ids: ids,
          derived_by: MODEL,
          last_confirmed_at: new Date().toISOString(),
        })),
        { onConflict: "user_id,statement_key" },
      );
    if (upsertErr) console.error("distill: upsert failed", upsertErr.message);
  }

  // Marked read when the model genuinely concluded nothing from it. That batch
  // has been considered; leaving it unmarked would retry the same items forever
  // and never move past them.
  const { error: markErr } = await admin
    .from("memory_items")
    .update({ distilled_at: new Date().toISOString() })
    .in("id", ids);
  if (markErr) console.error("distill: marking failed", markErr.message);

  return { read: items.length, written: facts.length };
}
