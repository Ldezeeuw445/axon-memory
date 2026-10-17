#!/usr/bin/env bash
# Smoke all three domains after a Pages deploy.
#   bash scripts/deploy/smoke.sh [expected-index-hash]
# Exits 1 on any non-200, or when a page serves a build other than the expected
# one (pass the index-*.js name from dist/index.html). Any 5xx → roll back:
#   POST /accounts/{acct}/pages/projects/{project}/deployments/{previous-id}/rollback
set -u
want="${1:-}"
bad=0
for h in app.axon-memory.com axon-memory.com www.axon-memory.com; do
  for p in / /recall /capture /docs /login "/?facet=recall" /product/recall.jpg /manifest.webmanifest; do
    sep='?'; [[ "$p" == *\?* ]] && sep='&'
    out=$(mktemp)
    c=$(curl -s -o "$out" -w '%{http_code}' -L --max-time 15 "https://$h$p${sep}nc=$RANDOM")
    js=$(grep -o 'index-[A-Za-z0-9_-]*\.js' "$out" | head -1)
    rm -f "$out"
    flag=""
    [[ "$c" != 200 ]] && { flag=" <-- status"; bad=1; }
    [[ -n "$want" && -n "$js" && "$js" != "$want" ]] && { flag="$flag <-- build"; bad=1; }
    echo "$h$p $c $js$flag"
  done
done
[[ $bad -eq 0 ]] && echo "smoke: ok" || echo "smoke: FAILED"
exit $bad
