#!/usr/bin/env bash
# A12-1 release gate, local half. Everything here runs on the box with no
# production access. The live half (isolation suites, SQL suites, recall eval,
# OAuth/MCP flow, domain smoke) is listed in docs/RUNBOOK.md "Release gate" and
# needs the Supabase MCP / fixtures; it is recorded in docs/ACCEPTANCE.md.
# Usage: bash scripts/release-gate.sh   (exit 0 only if every step passes)
set -u
cd "$(dirname "$0")/.."
unset SUPABASE_SERVICE_ROLE_KEY
pass=0; fail=0; failed=()
step() {
  local name="$1"; shift
  local log="/tmp/gate-$(echo "$name" | tr ' /' '__').log"
  if "$@" >"$log" 2>&1; then echo "PASS  $name"; pass=$((pass+1)); else echo "FAIL  $name  (log: $log)"; fail=$((fail+1)); failed+=("$name"); fi
}
step "deno typecheck + unit (_shared)"   deno test --allow-env supabase/functions/_shared/*.test.ts
# stripe-* import Stripe from esm.sh, whose type directives crash deno's
# TypeScript host (tool fault, not a type error in our code). They are not
# type-checked here; test:billing below executes the real webhook instead.
step "typecheck every edge function"     bash -c 'cd supabase/functions && for f in */index.ts; do case "$f" in stripe-*) continue;; esac; deno check "$f" || exit 1; done'
step "web unit (vitest)"                 npx vitest run
step "lexicon (canon words)"             node scripts/check-lexicon.mjs
step "plan names (Power, prices fixed)"  node scripts/check-plan-names.mjs
step "lint (errors fail, warnings allowed)" npx oxlint src
step "MCP gateway worker"                node --test cloudflare/mcp-gateway/worker.test.mjs
step "SDK unit"                          bash -c 'cd packages/sdk-ts && npm test --silent'
step "billing webhook replay (local)"    deno run -A tests/billing/webhook-replay.ts
step "production build"                  npx vite build
echo "---"
echo "$pass passed, $fail failed${failed:+: ${failed[*]}}"
[ "$fail" -eq 0 ]
