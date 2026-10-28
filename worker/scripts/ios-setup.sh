#!/usr/bin/env bash
# Создаёт iOS-проект и настраивает Info.plist. Запускать из папки worker/ на macOS.
set -euo pipefail

npx cap add ios --packagemanager SPM
npx -y @capacitor/assets@3 generate --ios --iconBackgroundColor '#2563EB' || echo "icon generation skipped"

PL=ios/App/App/Info.plist
pb() { /usr/libexec/PlistBuddy -c "$1" "$PL"; }
set_str() { pb "Delete :$1" 2>/dev/null || true; pb "Add :$1 string $2"; }

MSG="FlyerMap записывает маршрут раздачи во время смены. / FlyerMap zeichnet deine Verteilroute während der Schicht auf."
set_str NSLocationWhenInUseUsageDescription "$MSG"
set_str NSLocationAlwaysAndWhenInUseUsageDescription "$MSG"
set_str CFBundleDisplayName "FlyerMap"

pb "Delete :UIBackgroundModes" 2>/dev/null || true
pb "Add :UIBackgroundModes array"
pb "Add :UIBackgroundModes:0 string location"

pb "Delete :UISupportedInterfaceOrientations" 2>/dev/null || true
pb "Add :UISupportedInterfaceOrientations array"
pb "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait"

# приложение не использует собственное шифрование → не спрашивать про экспорт
pb "Delete :ITSAppUsesNonExemptEncryption" 2>/dev/null || true
pb "Add :ITSAppUsesNonExemptEncryption bool false"

plutil -lint "$PL"
npx cap sync ios
