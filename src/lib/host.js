/**
 * Which of the two front doors is this?
 *
 * One repo, one build, two domains:
 *
 *   axon-memory.com      the landing page — what someone sees before they buy
 *   app.axon-memory.com  the product — what someone opens after they have
 *
 * Both are served from this same SPA, so the hostname is what decides whether
 * "/" means "sell me this" or "let me in".
 *
 * WHY ONE BUILD AND NOT TWO. There were two deployments, and they drifted:
 * measured 2026-08-22, the apex served index-DeaHt3Vc.js titled "One memory
 * layer. Every AI you use." while app. served index-qMW6HpYe.js titled
 * "Universal AI Memory" — an older index.html from the same repo. Nobody
 * decided that; a deploy simply did not reach one of them, and there was
 * nothing to notice it. One artefact serving both domains cannot drift,
 * because there is only one of it.
 *
 * Server-rendered would let us do this at the edge. This is a static SPA, so
 * the decision happens on first paint instead. That is a real trade: the
 * landing route mounts for an instant on the app domain before redirecting.
 * The alternative — a Cloudflare redirect rule — puts the logic somewhere the
 * repo cannot see or test, which is how the two deployments got out of step in
 * the first place.
 */

/** Hosts that serve the PRODUCT. Anything else is the landing page. */
const APP_HOSTS = ['app.axon-memory.com'];

/** Where the app actually starts, once you are in it. */
export const APP_HOME = '/dashboard';

export function isAppHost(hostname = globalThis.location?.hostname ?? '') {
  const h = String(hostname).toLowerCase();
  if (APP_HOSTS.includes(h)) return true;
  // The installed Android app runs against app.axon-memory.com, so it is
  // covered above. Local dev is deliberately NOT an app host: `npm run dev`
  // should open the landing page, which is the one people forget to check.
  return false;
}
