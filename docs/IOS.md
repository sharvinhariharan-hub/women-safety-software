# iOS and Android without an App Store listing

Women Safety uses one Expo/React Native codebase for Android and iOS: the same SOS screen, safety circle, native permission prompts, optional evidence controls, and encrypted-backend/private-link flow. No App Store submission is required by this repository. The default downloadable previews are offline simulations and never send emergency alerts.

## GitHub downloads

Open [Build iOS previews](https://github.com/sharvinhariharan-hub/women-safety-software/actions/workflows/ios-preview.yml), choose a successful run, and download an artifact:

| Artifact | Purpose | Installation |
| --- | --- | --- |
| `women-safety-ios-simulator-preview` | Compiled iOS app for the iOS Simulator | Extract on a Mac with Xcode and install the `.app` in a compatible iOS Simulator. Cannot install on an iPhone. |
| `women-safety-ios-unsigned-device-preview` | Compiled iPhone/iPad `.ipa` | **Unsigned. Must be signed and provisioned before installation.** Downloading in Safari alone cannot install it. |
| Android offline APK | Compiled Android preview | Use the Android workflow described in [INSTALLING.md](INSTALLING.md). |

The iOS jobs compile a standalone Release bundle with the same offline preview flag as Android, verify the preview app identity and native target platform, and include a checksum and installation note. GitHub artifact downloads require a GitHub login and expire according to the repository's artifact retention settings. Compilation is not physical-device acceptance testing.

## Install on your own iPhone with Xcode

A Mac with full Xcode is required for this route; the command-line tools alone are insufficient. Use an Apple account in Xcode to sign a development build for your connected iPhone. A free Personal Team can be used for personal device testing, subject to Apple's restrictions and expiry; this is not a generally shareable iPhone download.

From `mobile/`:

```sh
npm ci
EXPO_PUBLIC_PREVIEW_MODE=true npx expo run:ios --device --configuration Release
```

Select your connected iPhone and complete Apple's signing/trust prompts yourself. If Xcode needs a signing team, open the generated iOS workspace and select a team you control. Native projects are generated from Expo configuration; keep permanent app settings in app config/plugins. Later OS versions can require Developer Mode. The offline preview does not ask for actual sensor/contact access.

## Share signed builds outside the App Store

For installation on registered iPhones without an App Store listing, use Apple's ad hoc distribution through Expo Build. This requires an Apple Developer Program account, signing credentials, and registered device UDIDs. A signed `.ipa` is restricted to devices included in its provisioning profile. GitHub hosting does not bypass Apple signing.

1. Sign in to your Expo account using `npx eas-cli@27.10.0 login`.
2. From `mobile/`, run `npx eas-cli@27.10.0 init` to link a project you own.
3. Register the target iPhone with `npx eas-cli@27.10.0 device:create`.
4. Build with `npx eas-cli@27.10.0 build --platform ios --profile ios-device-preview`. Complete Apple authentication and signing prompts yourself. This builds the offline preview, not a live alert app.
5. Use the actual Expo install URL printed after a successful build. A signed IPA can also be added as a GitHub release asset, but the signing profile's device restrictions remain. Ad hoc profiles can include registered device identifiers: review distribution before making such a file public.

For an Expo-built simulator archive use profile `ios-simulator-preview`; no Apple signing credentials are needed, but an Expo login/project is still required. Builds may be subject to the account's quota. No Expo account, paid subscription, Apple signing identity, or live messaging resource is created automatically here.

## Validation boundaries

Shared TypeScript/lint checks, isolated backend/permission/activation tests, Android/iOS JS bundle exports, and separate native iOS device/simulator compilation cover build compatibility. Real iPhone and Android checks still need to validate contacts, approximate/precise location, foreground/background grants, app termination, network loss, evidence save/export, and accessibility. Denying permission must not prevent SOS submission without location. No alert, call, recording, or police response is exercised by the build jobs.

References: [Apple Personal Team limits](https://developer.apple.com/help/account/basics/about-your-developer-account/), [Expo local device builds](https://docs.expo.dev/guides/local-app-development/), [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/), [iOS Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/).

## Current dependency-audit finding

On 18 November 2026, the shared CI dependency audit reports [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), a high-severity ReDoS finding affecting Picomatch through 4.0.7. The current upstream release is 4.0.7 and the advisory lists no patched version. Picomatch occurs in the Expo/Metro/lint tooling dependency tree. SOS profile and location endpoints do not accept glob patterns. This is not a claim that the issue is universally harmless: the audit remains enabled and failing until the dependency is fixed or formally reviewed. Native compilation and the isolated functional tests are reported separately from that audit result.

Version 0.4.1 preserves native evidence formats: QuickTime MOV on iOS, MP4 on Android. Saved-clip listing and export use the corresponding MIME type and Apple UTI; recordings are not converted or silently renamed across containers.
