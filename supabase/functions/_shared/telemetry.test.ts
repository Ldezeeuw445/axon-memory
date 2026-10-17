import { assertEquals } from "jsr:@std/assert@1";
import { recallRow, recordRecallEvent } from "./telemetry.ts";

Deno.test("telemetry: a recall row holds numbers and an outcome, nothing else", () => {
  assertEquals(recallRow({ surface: "api", ms: 412.6, ok: true, results: 3, semantic: true, embed_ms: 280.2 }),
    { surface: "api", ms: 413, ok: true, results: 3, semantic: true, embed_ms: 280, error_code: null });
  assertEquals(recallRow({ surface: "mcp", ms: -5, ok: false, results: NaN, error_code: "x".repeat(99) }),
    { surface: "mcp", ms: 0, ok: false, results: null, semantic: null, embed_ms: null, error_code: "x".repeat(40) });
});

Deno.test("telemetry: a failing or hanging insert never throws and never waits long", async () => {
  const throwing = { from: () => ({ insert: () => Promise.reject(new Error("db down")) }) } as never;
  await recordRecallEvent(throwing, { surface: "api", ms: 1, ok: true });
  const hanging = { from: () => ({ insert: () => new Promise(() => {}) }) } as never;
  const t0 = Date.now();
  await recordRecallEvent(hanging, { surface: "api", ms: 1, ok: true }, 50);
  if (Date.now() - t0 > 400) throw new Error("waited too long");
});
