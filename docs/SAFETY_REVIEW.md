# Safety and usability review — v0.4

This is an engineering review of the implemented prototype. It is not a certification, emergency-service approval, app-store approval, or a claim that every production scenario works.

## Scope and verified behavior

The user story is: app icon opens an idle home screen → deliberate two-second SOS hold → one incident with independent SMS/WhatsApp jobs → timestamped coordinates and a private location page → honest per-channel status. This review deliberately excludes real provider delivery and police response testing.

| Boundary               | Evidence / result                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home UI                | Actual React Native Web preview inspected at a 390 × 844 phone viewport. One large SOS button and a small Settings entry; setup and provider details stay off the idle screen.                                                                                                   |
| Accidental short taps  | Browser test and automated hold tests: short taps do nothing; repeated short taps do not accumulate into a hold.                                                                                                                                                                 |
| Deliberate activation  | Browser hold completes the local practice flow and displays “Nothing was sent. No location was accessed.”                                                                                                                                                                        |
| Interrupted activation | Gate tests cover release, cancellation, a late timer callback, and exactly one activation per continuous hold. App backgrounding/unmount disarms the gate.                                                                                                                       |
| App relaunch / return  | Saved, unconfirmed requests do not gain retry authorization merely by reopening the app. A fresh deliberate activation is required. Existing active incidents can still resume their previously authorized location session.                                                     |
| Delivery               | Adapter request fields, six-contact parallel submission on both channels, partial failures, unknown outcomes, and one coordinate follow-up are tested using substituted transports. No provider calls are made.                                                                  |
| Private location       | Authenticated writes, restricted recipient data, timestamps/accuracy, stale fixes, link expiry, revocation, encrypted storage, and retention are tested.                                                                                                                         |
| Voice                  | Grounded Pipecat replies, unknown facts, stale positions, unavailable/ended incidents, no dispatch claims, and a loopback-only speech bridge are tested. No telephone calling endpoint exists.                                                                                   |
| Test network safety    | Node test runner blocks external fetches and fails on an attempted external request. Voice test runner blocks external socket connections/name lookups. Local loopback fixtures are allowed.                                                                                     |
| Offline preview        | Preview uses in-memory sample contacts, no live API fallback, no GPS reads, and no real messages/calls. Its Android configuration removes Internet, location, SMS, phone, microphone, camera, contact access, overlay, and unnecessary runtime permissions. APK CI also checks merged permission output. |
| Phone identity         | Custom 1024px launcher assets, Android adaptive/themed icons, native application IDs, launcher activity from prebuild, and a separate preview app identity are configured.                                                                                                       |

The browser test found a timer-binding bug that pure logic tests did not expose. The timer was changed to call the global timer functions through wrappers; the short-tap and long-hold browser tests then passed. This is why bundle/type checks are not presented as proof of physical-device reliability.

## Activation and accessibility

Touch activation requires one continuous two-second hold. Releasing early cancels it. No confirmation dialog appears before SOS activation. Screen-reader users have an explicit activation action rather than relying on touch timing. Settings controls have accessible labels, clear text, and separated touch targets. Physical VoiceOver/TalkBack, large-font, and motor-accessibility testing remain outstanding; formal accessibility conformance is not claimed.

## Deployment boundaries still outstanding

- Physical Android/iPhone testing: locked screens, denied permissions, force-quit, battery restrictions, sensor accuracy, background notifications, and poor connectivity.
- Real SMS sender registration, WhatsApp sender/template approval, recipient eligibility/consent, opt-out operations, carrier receipts, and delivery latency.
- A monitored, consenting police/ERSS integration. An accepted webhook is not dispatch. Pipecat currently provides local conversation testing, not automatic police calls.
- Human acknowledgement, operational monitoring, contact verification, broader abuse controls, and independent security review before a public safety deployment.
- iOS signing/distribution and actual installation on the user's phone. A web preview is not a native install or a physical-device test.

The code review maintains the previously documented data boundaries: OS-backed mobile credential storage; encrypted backend records; minimal recipient read responses; expiring bearer links; no invented incident details or landmarks; no promise of a one-minute response. Legal/regulatory compliance depends on deployment, jurisdiction, and service agreements and has not been certified here.

## Safe commands

```sh
npm test
npm run check:mobile
npm --prefix mobile run lint -- --max-warnings 0
.venv/bin/python -m voice_agent.run_tests
```

These checks must remain isolated. Do not replace local/mock test transports with production credentials for routine verification. No real emergency-service test should be performed without prior coordination.

## v0.4 setup and optional evidence

First-run setup exposes the contact picker/manual entry and then separate, explained permission actions. Contact changes reset recipient consent. Foreground permission is requested directly, background permission follows foreground access, and denial leaves SOS available. Camera and microphone are requested sequentially only when enabling optional evidence. Permission grants never start a recording. The preview returns before native permission APIs and its Android package blocks contacts/camera/microphone as well as network/location/calling/messaging.

Automated permission tests cover preview isolation, camera denial preventing the microphone prompt, microphone denial keeping recording disabled, and enabling evidence only after both grants. Existing backend/activation tests remain isolated from external networks. Browser checks cover contact selection simulation, permission setup, finish-to-SOS, deliberate hold, and evidence remaining simulated. Native prompts, capture quality, interruption/save recovery, export/deletion, and camera lifecycle need physical-device validation. Recordings remain in app-private document storage; no extra application-level encryption is claimed, and OS backups may include them.

## iOS build coverage and dependency audit — 18 November 2026

The repository now includes separate native iOS Simulator and unsigned iPhone/iPad compilation jobs in addition to Android. The unsigned IPA is explicitly marked as requiring Apple signing/provisioning; no App Store submission is configured. [IOS.md](IOS.md) documents personal Xcode testing and ad hoc installation without an App Store listing. Native compilation does not replace real-phone testing.

The dependency audit now reports unpatched upstream Picomatch advisory [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) through the build-tool dependency chain. The audit gate remains enabled. Earlier zero-finding audit results describe their original test dates and do not establish the current dependency status.
