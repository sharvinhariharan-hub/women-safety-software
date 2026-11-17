# Contributing

Use Node.js 24+ and install mobile dependencies with `npm ci` inside `mobile/`.

Before opening a pull request, run `npm test`, `npm run check:mobile`, and export the mobile bundles. Add meaningful tests for changes to authentication, delivery semantics, incident idempotency, location access, or sharing expiry. Keep test mode unable to send external messages.

Never commit credentials, real contact numbers, personal locations, database files, or agency integration registries. Use fictional fixtures. Describe what was tested on real devices and what was only type-checked or bundled.

UI text must distinguish queued, submitted, delivered, uncertain, and unavailable states. Do not claim that a human saw an SMS or that an agency dispatched help based on HTTP acceptance. Never add automatic public location sharing or covert tracking.

Open an issue for a reproducible bug or scoped feature proposal. Use the security reporting instructions for vulnerabilities.
