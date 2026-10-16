#!/bin/bash
# Double-click AFTER you've created your account in the app.
bash <(curl -fsSL https://raw.githubusercontent.com/dwrack/Poppy/master/supabase/setup.sh) lock
echo ""
read -n 1 -s -r -p "Press any key to close this window."
