#!/usr/bin/env bash
# Generated Expo native projects are never edited by this script.
set -euo pipefail
case "${1:-}" in
  simulator) sdk=iphonesimulator; platform='iOS Simulator'; label=simulator ;;
  unsigned-device) sdk=iphoneos; platform=iOS; label=unsigned-device ;;
  *) echo 'Usage: build-ios-preview.sh simulator|unsigned-device' >&2; exit 2 ;;
esac
if [ "${EXPO_PUBLIC_PREVIEW_MODE:-}" != true ]; then
  echo 'Preview packaging requires EXPO_PUBLIC_PREVIEW_MODE=true.' >&2; exit 2
fi
cd "$(dirname "$0")/../mobile"
mkdir -p dist-ios
workspace=$(find ios -maxdepth 1 -name '*.xcworkspace' -print -quit)
if [ -z "$workspace" ]; then echo 'Run Expo prebuild and pod install first.' >&2; exit 1; fi
xcodebuild -workspace "$workspace" -scheme SOSPreview -configuration Release \
  -sdk "$sdk" -destination "generic/platform=$platform" \
  -derivedDataPath "build-ios-$label" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  ONLY_ACTIVE_ARCH=NO build > "dist-ios/build-$label.log" 2>&1 || {
    tail -100 "dist-ios/build-$label.log"; exit 1;
  }
app=$(find "build-ios-$label/Build/Products/Release-$sdk" -maxdepth 1 -name '*.app' -print -quit)
if [ -z "$app" ] || [ ! -f "$app/main.jsbundle" ]; then
  echo 'Missing standalone app or bundled JavaScript.' >&2; exit 1
fi
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")
if [ "$bundle_id" != org.womensafety.sos.preview ]; then echo 'Wrong preview identity.' >&2; exit 1; fi
executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Info.plist")
xcrun vtool -show-build "$app/$executable" > "dist-ios/platform-$label.txt"
if [ "$label" = simulator ]; then
  grep -q 'platform IOSSIMULATOR' "dist-ios/platform-$label.txt"
  archive=women-safety-ios-simulator-preview.app.tar.gz
  tar -czf "dist-ios/$archive" -C "$(dirname "$app")" "$(basename "$app")"
  explanation='For iOS Simulator on a Mac with Xcode. This archive cannot install on an iPhone.'
else
  grep -Eq 'platform IOS[[:space:]]*$' "dist-ios/platform-$label.txt"
  stage=$(mktemp -d)
  mkdir -p "$stage/Payload"
  ditto "$app" "$stage/Payload/$(basename "$app")"
  archive=women-safety-ios-UNSIGNED-preview.ipa
  ditto -c -k --keepParent "$stage/Payload" "dist-ios/$archive"
  explanation='UNSIGNED iPhone/iPad preview. Requires Apple signing and provisioning before installation. Not an App Store upload; not a Safari-installable app.'
fi
{
  echo 'Women Safety — offline iOS preview'
  echo "$explanation"
  echo 'No alerts, calls, GPS, camera, or microphone access in this preview.'
  echo "Source: ${GITHUB_SHA:-local}"
  xcodebuild -version
  echo "Bundle: $bundle_id"
  shasum -a 256 "dist-ios/$archive"
} > "dist-ios/README-$label.txt"
# Retain logs as workflow diagnostics, not in the downloadable app artifact.
tail -15 "dist-ios/build-$label.log"
rm "dist-ios/build-$label.log"
