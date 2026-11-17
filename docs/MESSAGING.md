# SMS and WhatsApp alerts

Each contact can select SMS, WhatsApp, or both. New mobile contacts default to both; contacts saved in v0.1 stay SMS-only until the owner explicitly selects WhatsApp. Existing consent is not silently expanded to another channel. A contact must agree to receive SOS notifications through the selected channels.

Six contacts with both channels produce twelve independent initial jobs. A failure on one channel does not prevent another from submitting. Each job has its own provider status and is encrypted in the persistent outbox.

## What gets sent

Both channels carry the same available snapshot:

- The configured name and SOS/help request.
- Latitude and longitude, recording time, and reported accuracy.
- Approximate mapped place name, if a configured reverse geocoder returns one.
- A Google Maps coordinate link.
- The private, expiring location-page link.

The private webpage updates as the phone uploads fixes. Coordinates and maps links inside messages are snapshots, not live WhatsApp location objects. The WhatsApp Business API does not expose WhatsApp's native Live Location feature.

The backend does not wait for GPS to send the first alert. If GPS is missing, the message explicitly says coordinates are unavailable and still includes the private page. When a fix later arrives, a **single location follow-up per initially submitted channel** includes the coordinates, map link, and same private link. It is not resent for every movement. If a location becomes available before an initial job is submitted, that initial message includes it and no extra coordinate follow-up is needed. Failed or unconfigured initial jobs are not automatically retried through follow-ups. Ambiguous initial submissions may receive a clearly labelled location update, but their original request is never blindly resent.

Stopping sharing revokes the private link. It cannot recall coordinates already included in a message. Snapshot messages include timestamps so recipients can distinguish them from current position updates.

## Twilio configuration

SMS keeps the existing `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` configuration.

For WhatsApp, register a WhatsApp sender and obtain approval for the following **text** template in Twilio's Content Template Builder. The sender is the project's business sender, not an impersonation of the user's personal WhatsApp account.

```text
Safety alert for {{1}}: {{2}}.
Coordinates: {{3}}.
Approximate mapped place: {{4}}.
Location recorded: {{5}}.
Open map: {{6}}
Private location updates: {{7}}
Sharing expires: {{8}}.
An SOS was requested. This does not confirm that emergency responders have been dispatched.
```

All eight variable placeholders must match these meanings. Use plain text placeholders for URLs in this template; do not configure a separate dynamic URL button with a different variable contract. Approval/category eligibility is decided by WhatsApp; this repository does not guarantee approval.

Set these additional private environment values:

```dotenv
TWILIO_WHATSAPP_FROM=whatsapp:+your_registered_sender_number
TWILIO_WHATSAPP_CONTENT_SID=HX_your_approved_content_sid
```

A real Content SID must be `HX` followed by 32 hexadecimal characters. The explanatory value above is not valid; until real credentials/template values are configured, the app says WhatsApp is not connected. Outbound requests use `ContentSid` and JSON `ContentVariables`, with **no `Body` field**, so they do not depend on a recipient having messaged the business in the last 24 hours. Template and recipient eligibility still apply. No fallback to unapproved free-form messages is attempted.

`ALERT_MODE=test` makes no provider requests, including geocoding. Test jobs are labelled `test_only`. Incident mode is captured at activation; switching the server to live does not send follow-ups for an earlier test incident. Create a new live incident only after setup and consent are ready.

Both channels use Twilio's message resource for status reads. `submitted` is not `delivered`; WhatsApp `read` confirms delivery but is not represented as human acknowledgement or acceptance of responsibility. A timeout after a submission is `unknown` and is not automatically resent.

## Optional approximate place names

`GEOCODER_URL` may point to an operator-owned or contracted **Nominatim-compatible `/reverse` endpoint**. No public service is selected by default. Queries include the actual coordinates and request `format=jsonv2`. Lookups are shared across the jobs in a worker pass, bounded to two seconds, and failures fall back to “Place name unavailable.” Initial alerts without GPS are not delayed for an address.

Example schema only:

```dotenv
GEOCODER_URL=https://your-geocoder.example/reverse
```

Configure only an endpoint you intend to receive users' precise location, with capacity and usage terms appropriate to this app. Mapped labels are approximate; the app does not invent or independently verify landmarks. Label values are tied to the location timestamp and are discarded when a newer fix arrives. Self-hosting can avoid a commercial geocoding API fee, but still uses your infrastructure.

## Cost and verification

The code and local Pipecat prototype are open source. SMS and automated WhatsApp service operation are not promised to be free; provider and carrier fees can apply. No paid resources or accounts are provisioned by these changes.

Automated tests use intercepted provider requests. They verify the request fields and independent delivery states without sending real messages. Real sender registration, template approval, recipient eligibility, deliverability, and carrier latency remain deployment checks.

References: [Twilio Content Templates](https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder), [WhatsApp location limitations](https://www.twilio.com/docs/whatsapp/message-features), [WhatsApp pricing](https://whatsappbusiness.com/products/platform-pricing/).
