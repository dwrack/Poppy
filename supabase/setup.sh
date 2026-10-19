#!/usr/bin/env bash
# Poppyseed Clothes: one-time Supabase setup. Run from Terminal on your Mac:
#   bash <(curl -fsSL https://raw.githubusercontent.com/dwrack/Poppy/master/supabase/setup.sh)
# To store the Claude API key on the server:
#   bash <(curl -fsSL https://raw.githubusercontent.com/dwrack/Poppy/master/supabase/setup.sh) key
# After you've created your account in the app, close sign-ups with:
#   bash <(curl -fsSL https://raw.githubusercontent.com/dwrack/Poppy/master/supabase/setup.sh) lock
#
# It asks for a Supabase personal access token, uses it only for the calls
# below, and never saves it anywhere.
set -euo pipefail

REF="yrcddfehjjbtzwuotmym"
APP_URL="https://dwrack.github.io/Poppy/"
RAW="https://raw.githubusercontent.com/dwrack/Poppy/master/supabase"
API="https://api.supabase.com/v1/projects/$REF"

printf "\nPoppyseed Clothes setup\n\n"
printf "Paste your Supabase access token (starts with sbp_) and press Return.\n"
printf "Nothing will show while you paste, that's normal: "
read -rs TOKEN </dev/tty
printf "\n\n"
case "$TOKEN" in
  sbp_*) ;;
  *) echo "That doesn't look right. The token should start with sbp_"; exit 1 ;;
esac

call() { # method path body-file
  local out code
  out=$(mktemp)
  code=$(curl -sS -o "$out" -w "%{http_code}" -X "$1" "$API$2" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    --data-binary "@$3")
  if [ "${code:0:1}" != "2" ]; then
    echo "Supabase said ($code): $(cat "$out")"
    rm -f "$out"
    exit 1
  fi
  rm -f "$out"
}

body=$(mktemp)
trap 'rm -f "$body"' EXIT

if [ "${1:-}" = "key" ]; then
  printf "Now paste your Claude API key (starts with sk-ant-) and press Return.\n"
  printf "It stays hidden while you paste: "
  read -rs AKEY </dev/tty
  printf "\n\n"
  case "$AKEY" in sk-ant-*) ;; *) echo "That doesn't look right. The key should start with sk-ant-"; exit 1 ;; esac
  printf '[{"name":"ANTHROPIC_API_KEY","value":"%s"}]' "$AKEY" > "$body"
  call POST /secrets "$body"
  echo "Done. The Claude key is stored on the server. Auto-tagging and Find it online are on."
elif [ "${1:-}" = "lock" ]; then
  echo '{"disable_signup": true}' > "$body"
  call PATCH /config/auth "$body"
  echo "Done. Sign-ups are closed. Only your existing account can sign in."
else
  echo "1/2 Creating your closet, profile and measurement tables..."
  curl -fsSL "$RAW/schema.query.json" -o "$body"
  call POST /database/query "$body"

  echo "2/2 Pointing sign-in at the app and skipping the confirmation email..."
  printf '{"site_url":"%s","uri_allow_list":"%s**","mailer_autoconfirm":true}' \
    "$APP_URL" "$APP_URL" > "$body"
  call PATCH /config/auth "$body"

  echo ""
  echo "All set. Open $APP_URL on your phone and create your account."
  echo "Then run this same command with ' lock' on the end to close sign-ups."
  echo "Finally, delete the token at supabase.com/dashboard/account/tokens"
fi
