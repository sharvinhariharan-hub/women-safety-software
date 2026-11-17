# Police partner integration

There is no default police destination. This software does not automatically notify every police station, dispatch officers, or integrate with 112.

An operator must first agree a monitored alert channel, coverage area, authentication, incident workflow, and test procedure with the receiving agency. Do not use scraped station phone numbers as destinations. Register only agencies that explicitly consented; the software trusts the operator's `consentConfirmed` field and does not independently verify a government identity.

Set `POLICE_REGISTRY_PATH` to a local, non-public JSON registry, and `POLICE_WEBHOOK_TOKEN` to a random secret agreed with the receiving agency. The current adapter uses a single shared integration token; isolate deployments if agencies require distinct credentials.

Example **schema only** (the `.invalid` endpoint cannot receive alerts):

```json
[
  {
    "name": "Consenting agency name",
    "latitude": 12.97,
    "longitude": 77.59,
    "radiusKm": 10,
    "consentConfirmed": true,
    "webhook": "https://agency.example.invalid/sos"
  }
]
```

Do not commit a real registry or agency secrets. The backend selects the nearest eligible configured station by straight-line distance within `radiusKm` (default 25 km). This is not jurisdiction-aware dispatch, routing, or a complete directory of nearby stations. Agency selection waits for the first location and happens only once per incident. A materially stale or inaccurate location may select the wrong partner; operators must address this with agencies before real use.

The mobile owner must also enable police alerts. If no eligible station exists, no job is created and the app says no police alert was submitted.

The webhook receives:

```http
POST /sos
Authorization: Bearer <agreed-secret>
Idempotency-Key: <job-uuid>
Content-Type: application/json
```

```json
{
  "event": "sos",
  "incidentId": "incident-uuid",
  "name": "User's configured name",
  "location": {
    "latitude": 12.97,
    "longitude": 77.59,
    "accuracy": 20,
    "timestamp": 1794900000000
  },
  "trackingUrl": "https://your-backend.example/track#private-capability",
  "expiresAt": 1794986400000
}
```

The link shows subsequent updates; the webhook coordinate is a snapshot. The receiver must protect the payload/link, validate authorization, deduplicate on `Idempotency-Key`, and use an agreed monitored workflow. A 2xx response means **submitted only**, never “police dispatched.” Network ambiguity is “unknown.” This version has no agency dispatch acknowledgement or cancellation callback. Ending location sharing revokes the link, but does not inform an agency that an emergency response should be canceled.

Use test mode and a coordinated receiving sandbox first. Test mode creates `test_only` jobs without making webhook calls.
