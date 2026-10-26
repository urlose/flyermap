#!/usr/bin/env bash
# Creates the Android project (Capacitor) and adds the permissions needed for background tracking
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d android ] || npx cap add android
npx cap sync android
M=android/app/src/main/AndroidManifest.xml
add() { grep -q "$1" "$M" || sed -i "s|<application|<uses-permission android:name=\"$1\" />\n    <application|" "$M"; }
for P in android.permission.INTERNET android.permission.ACCESS_FINE_LOCATION android.permission.ACCESS_COARSE_LOCATION android.permission.FOREGROUND_SERVICE android.permission.FOREGROUND_SERVICE_LOCATION android.permission.POST_NOTIFICATIONS android.permission.WAKE_LOCK; do add "$P"; done
# stable signing key so that new builds update the installed app
mkdir -p ~/.android && cp signing/debug.keystore ~/.android/debug.keystore
grep -n "uses-permission" "$M"
