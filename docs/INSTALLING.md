# Install on a phone

This is a native Expo/React Native app with an ordinary launcher icon. Opening the icon shows the SOS screen; it does not send a new SOS. After installation, the phone's launcher controls where the icon appears. Add or drag it to the home screen/dock as you would another app; the app does not silently change launcher settings.

## Safe Android preview

The repository's **Build offline Android preview** GitHub Actions workflow produces a standalone **ARM64 APK** named `app-release.apk`. It uses the generated development signing key for preview installation, not a production/store signing identity. It needs no Expo account or Metro development server to run.

1. Open the successful workflow run and download the `women-safety-offline-preview-arm64` artifact.
2. Extract the APK and transfer it to your Android phone.
3. Open the APK and complete Android's normal installation flow for this file.
4. Open **SOS Preview** from the app drawer; add its icon to your home screen/dock if desired.

The preview has a separate application ID from a future live build. It uses sample contacts, keeps changes only in memory, and has no live backend configuration. Its Android permissions explicitly deny Internet, location, SMS, phone calls, and microphone. The build verifies those restrictions in the merged APK permissions before uploading it. A two-second hold only shows a simulated outcome. **It cannot send real alerts.**

This artifact targets ARM64 phones; x86 emulators and older 32-bit phones require a separately built architecture. Actual installation and native interaction on the user's physical phone are not performed from this chat.

## iPhone

The iOS app identity and launcher icon are configured, and the iOS JavaScript bundle is checked in CI. A native iPhone app still requires Apple's signing/provisioning and an appropriate installation route (for example, an Xcode development build or TestFlight). An Android APK cannot install on an iPhone. No signed iOS IPA or TestFlight upload is produced by this repository's Android workflow.

With Xcode configured, a local native development build can be produced with `npx expo run:ios` in `mobile/`. For an offline preview set `EXPO_PUBLIC_PREVIEW_MODE=true` for the build. The preview branch does not access live APIs or GPS; the additional Android permission checks are Android-specific.

## Local browser preview

From `mobile/`, build the same UI in offline preview mode:

```sh
EXPO_PUBLIC_PREVIEW_MODE=true npx expo export --platform web --output-dir dist-preview
python3 -m http.server 8089 --bind 127.0.0.1 --directory dist-preview
```

Open `http://localhost:8089`. A short tap does nothing. Hold the large button for two seconds to practice. The screen is clearly labelled offline preview. This checks the shared interface, not native background execution.

## Live builds

A future live install uses the ordinary application identity and a configured backend, with provider credentials and approvals stored on the backend. Keep production signing credentials private, select application identifiers you control before store distribution, and complete the physical-device and operational checks in [SAFETY_REVIEW.md](SAFETY_REVIEW.md). This development release is not certified as an emergency response product.
