#!/bin/bash
# Double-click to store your Claude API key on the Poppyseed server.
# It asks for your Supabase access token first, then the Claude key.
bash <(curl -fsSL https://raw.githubusercontent.com/dwrack/Poppy/master/supabase/setup.sh) key
echo ""
read -n 1 -s -r -p "Press any key to close this window."
