#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://127.0.0.1:3015}"
for P in / /about /services /performances /gallery /contact /robots.txt /sitemap.xml /llms.txt /admin; do
  CODE=$(curl -s -o /tmp/royal-test-body -w '%{http_code}' "$BASE$P")
  if [ "$CODE" != "200" ]; then echo "FAIL $P -> $CODE"; exit 1; fi
  echo "PASS $P -> 200"
done
curl -fsS "$BASE/" | grep -q '<title>' && echo 'PASS SSR title'
curl -fsS "$BASE/" | grep -q 'application/ld+json' && echo 'PASS JSON-LD'
curl -fsS "$BASE/sitemap.xml" | grep -q '<urlset' && echo 'PASS sitemap XML'
curl -fsS "$BASE/llms.txt" | grep -q '# THE ROYAL BAND' && echo 'PASS llms.txt'
echo 'All public checks passed.'
