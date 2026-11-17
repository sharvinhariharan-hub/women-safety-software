# Security reporting

Do not put credentials, location links, contact information, or an exploitable security report in a public issue. Use this repository's GitHub **Security → Report a vulnerability** feature when available. If private reporting is not enabled, contact the maintainer privately via the GitHub profile before sending sensitive details.

This is an early development project with no security audit or emergency-service certification. The current backend is single-owner; do not expose it as a multi-user public service. Keep the owner token, DATA_KEY, SMS credentials, and police registry private. Rotate exposed credentials and re-pair the phone. The private location link is a bearer capability until revocation or expiry.

Known limitations and deployment boundaries are described in README.md and docs/DEVICE_TEST_PLAN.md.
