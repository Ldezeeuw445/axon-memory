// Uptime watch (spec §37 step 15). check-alerts probes the public front doors
// every 5 minutes and writes a system_alerts row when one goes down, and one
// when it comes back. Pure logic here; the function does the I/O.

export type Target = { name: string; url: string; expect: "health" | "html" };
export const TARGETS: Target[] = [
  { name: "mcp", url: "https://mcp.axon-memory.com/health", expect: "health" },
  { name: "app", url: "https://app.axon-memory.com/login", expect: "html" },
  { name: "site", url: "https://axon-memory.com/", expect: "html" },
];

export type Probe = { name: string; ok: boolean; status: number; ms: number; reason?: string };
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** One request; a target is healthy only if it answers 200 with the right body. */
export async function probeOnce(target: Target, fetchFn: FetchLike, timeoutMs = 8000): Promise<Probe> {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${target.url}${target.url.includes("?") ? "&" : "?"}uptime=1`, { signal: ctl.signal, headers: { "user-agent": "axon-uptime/1" } });
    const body = await res.text();
    const ms = Date.now() - t0;
    if (res.status !== 200) return { name: target.name, ok: false, status: res.status, ms, reason: `status ${res.status}` };
    if (target.expect === "health") {
      let j: { status?: string; database?: string } = {};
      try { j = JSON.parse(body); } catch { return { name: target.name, ok: false, status: 200, ms, reason: "health is not JSON" }; }
      if (j.status !== "ok") return { name: target.name, ok: false, status: 200, ms, reason: `health status ${j.status}` };
      if (j.database && j.database !== "ok") return { name: target.name, ok: false, status: 200, ms, reason: `database ${j.database}` };
    } else if (!/\/assets\/index-[\w-]+\.js/.test(body)) {
      return { name: target.name, ok: false, status: 200, ms, reason: "page has no app bundle" };
    }
    return { name: target.name, ok: true, status: 200, ms };
  } catch (e) {
    return { name: target.name, ok: false, status: 0, ms: Date.now() - t0, reason: ctl.signal.aborted ? `timeout ${timeoutMs}ms` : String((e as Error)?.message ?? e).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

/** Down only if it fails twice in a row, a few seconds apart: one dropped packet is not an outage. */
export async function probe(target: Target, fetchFn: FetchLike, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<Probe> {
  const first = await probeOnce(target, fetchFn);
  if (first.ok) return first;
  await wait(3000);
  return probeOnce(target, fetchFn);
}

export type LastState = Record<string, "down" | "up" | undefined>;
export type NewAlert = { alert_type: "uptime_down" | "uptime_recovered"; message: string; metadata: Record<string, unknown> };

/**
 * Turns probe results into alerts, given the last uptime alert per target.
 * Down is raised once per outage (not every 5 minutes); recovery once after.
 */
export function decide(results: Probe[], last: LastState): NewAlert[] {
  const out: NewAlert[] = [];
  for (const r of results) {
    const was = last[r.name];
    if (!r.ok && was !== "down") {
      out.push({ alert_type: "uptime_down", message: `${r.name} is down: ${r.reason ?? `status ${r.status}`}`, metadata: { target: r.name, status: r.status, ms: r.ms, reason: r.reason } });
    } else if (r.ok && was === "down") {
      out.push({ alert_type: "uptime_recovered", message: `${r.name} is back (${r.ms} ms)`, metadata: { target: r.name, status: r.status, ms: r.ms } });
    }
  }
  return out;
}

/** Latest uptime alert per target, from rows ordered newest first. */
export function lastState(rows: { alert_type: string; metadata: { target?: string } | null }[]): LastState {
  const s: LastState = {};
  for (const row of rows) {
    const t = row.metadata?.target;
    if (!t || s[t]) continue;
    if (row.alert_type === "uptime_down") s[t] = "down";
    else if (row.alert_type === "uptime_recovered") s[t] = "up";
  }
  return s;
}
