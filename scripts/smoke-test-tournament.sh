#!/bin/bash
# Tournament smoke test script
# Run with: ./scripts/smoke-test-tournament.sh [API_BASE_URL]
# Example: ./scripts/smoke-test-tournament.sh http://localhost:3001

set -e
API_BASE="${1:-http://localhost:3001}"

echo "=== Tournament Smoke Test ==="
echo "API Base: $API_BASE"
echo ""

# 1. List active tournaments
echo "1. Listing active tournaments..."
RES=$(curl -s "$API_BASE/api/tournament/list?includePrivate=false")
if echo "$RES" | grep -q '"tournaments"'; then
  echo "   ✓ List tournaments OK"
else
  echo "   ✗ List tournaments failed: $RES"
  exit 1
fi

# 2. Test cancel endpoint (will fail with 404/403 without real tournament - that's expected)
echo ""
echo "2. Testing cancel endpoint (expect 404 without valid tournament)..."
CANCEL_RES=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/tournament/00000000-0000-0000-0000-000000000000/cancel" \
  -H "Content-Type: application/json" \
  -d '{"cancellerAddress":"0x0000000000000000000000000000000000000001"}')
HTTP_CODE=$(echo "$CANCEL_RES" | tail -1)
BODY=$(echo "$CANCEL_RES" | head -n -1)
if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "400" ]; then
  echo "   ✓ Cancel endpoint reachable (HTTP $HTTP_CODE - expected without real tournament)"
elif [ "$HTTP_CODE" = "200" ]; then
  echo "   ✓ Cancel succeeded (unexpected with fake ID - DB may have test data)"
else
  echo "   ? Cancel returned HTTP $HTTP_CODE: $BODY"
fi

# 3. Test reclaim endpoint
echo ""
echo "3. Testing reclaim endpoint (expect 400/404 without valid cancelled tournament)..."
RECLAIM_RES=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/tournament/00000000-0000-0000-0000-000000000000/reclaim" \
  -H "Content-Type: application/json" \
  -d '{"creatorAddress":"0x0000000000000000000000000000000000000001"}')
HTTP_CODE=$(echo "$RECLAIM_RES" | tail -1)
if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "400" ]; then
  echo "   ✓ Reclaim endpoint reachable (HTTP $HTTP_CODE - expected)"
else
  echo "   ? Reclaim returned HTTP $HTTP_CODE"
fi

echo ""
echo "=== API smoke test complete ==="
echo ""
echo "Manual test steps (require wallet + UI):"
echo "  1. Create: Blackjack → Tournaments → Create → Fill form → Sign createTournament tx"
echo "  2. Join:   Browse tournaments → Join → Approve MORBIUS → Sign joinTournament tx"
echo "  3. Cancel: As creator, open tournament → Cancel Tournament (0 players only)"
echo "  4. Reclaim: As creator of cancelled custom-token tournament → Reclaim Funds (signs creatorReclaim)"
