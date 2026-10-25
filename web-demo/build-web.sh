#!/usr/bin/env bash
# Builds the browser demo of Nudge: the real app with made-up data, for showing on any phone.
# Needs react-dom, react-native-web and @expo/metro-runtime installed locally (npm i --no-save),
# so the Android build and its package.json stay as they are.
set -euo pipefail
OUT=${1:?output folder}
rm -rf "$OUT"
NUDGE_DEMO=1 EXPO_OFFLINE=1 CI=1 npx expo export --platform web --output-dir "$OUT" >/dev/null
JS=$(cd "$OUT" && ls _expo/static/js/web/*.js)
# Served from a sub-path: every root-relative asset becomes relative to the page
sed -i 's#"/assets/#"./assets/#g' "$OUT/$JS"
# Names starting with "_" are reserved where the demo is hosted
mv "$OUT/$JS" "$OUT/app.js" && rm -rf "$OUT/_expo" "$OUT/metadata.json"
cp "$(dirname "$0")/page.html" "$OUT/index.html"
sed -i "s#__BUNDLE__#./app.js#" "$OUT/index.html"
echo "$OUT"
