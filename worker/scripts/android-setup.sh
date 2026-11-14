#!/usr/bin/env bash
# Creates the Android project (Capacitor) and adds the permissions needed for background tracking
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d android ] || npx cap add android
npx cap sync android
# app icon from assets/icon-only.png + adaptive icon (icon-foreground / icon-background)
npx -y @capacitor/assets@3 generate --android --iconBackgroundColor '#2563EB' || echo "icon generation skipped"
M=android/app/src/main/AndroidManifest.xml
add() { grep -q "$1" "$M" || sed -i "s|<application|<uses-permission android:name=\"$1\" />\n    <application|" "$M"; }
for P in android.permission.INTERNET android.permission.ACCESS_FINE_LOCATION android.permission.ACCESS_COARSE_LOCATION android.permission.FOREGROUND_SERVICE android.permission.FOREGROUND_SERVICE_LOCATION android.permission.POST_NOTIFICATIONS android.permission.WAKE_LOCK; do add "$P"; done
# stable signing key so that new builds update the installed app.
# Private key from the repository secret ANDROID_KEYSTORE_B64 (base64 of a debug-format keystore: alias androiddebugkey,
# password android). Until that secret is set, the old key from the repository is used (it is public: anybody could sign with it).
mkdir -p ~/.android
if [ -n "${ANDROID_KEYSTORE_B64:-}" ]; then
  echo "$ANDROID_KEYSTORE_B64" | base64 -d > ~/.android/debug.keystore
  echo "signing: private key from the repository secret"
else
  cp signing/debug.keystore ~/.android/debug.keystore
  echo "signing: public key from the repository (secret ANDROID_KEYSTORE_B64 not set)"
fi
grep -n "uses-permission" "$M"
