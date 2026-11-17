# Device acceptance plan

Status: **not executed on physical devices for v0.2.0**. Never rely on this release for real emergencies until its behavior has been validated for the supported devices and deployment.

Use test mode and fictional contacts first. Coordinate a separate live SMS test with consenting recipients; do not contact police or emergency dispatch as an unannounced test.

| Scenario                                 | Expected observation                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Prepared app, one tap                    | One incident, one job per selected contact, no second confirmation                           |
| GPS slow or denied                       | SOS still created; location unavailable is explicit                                          |
| Repeated taps or API timeout             | Same active incident; no duplicate initial SMS                                               |
| Server unreachable                       | Unconfirmed request persisted; visible retry state; no claim of delivery                     |
| App reopened after offline request       | Same request ID retried; existing incident recovered                                         |
| Phone loses internet after activation    | Recipient location becomes stale; latest fix uploads when connectivity and execution return  |
| Foreground tracking                      | Position timestamp and accuracy update on recipient page                                     |
| Background and locked phone              | Test each OS/version and battery mode; verify updates or record interruption                 |
| Background denied                        | Foreground-only notice; no claim of background readiness                                     |
| App force-quit, OS kills, phone reboot   | Record actual platform behavior; never assume continuous tracking                            |
| SMS and WhatsApp selected                | Two independent jobs per contact; both contain coordinates/maps/private links when available |
| GPS arrives after initial alerts         | One coordinate follow-up per submitted channel; no message for every movement                |
| WhatsApp template missing or rejected    | Explicit unavailable/failed WhatsApp state; SMS continues                                    |
| Local Pipecat conversation               | Identifies itself, reports only recorded facts, marks unknown/stale/unavailable details      |
| One recipient invalid                    | Other submissions continue; failed job remains visible                                       |
| Provider accepts but no receipt          | Submitted, not delivered                                                                     |
| Provider connection times out            | Unknown; no blind resend                                                                     |
| Server restarts mid-send                 | In-flight job becomes unknown rather than automatically duplicated                           |
| End sharing                              | Link returns 410; pending jobs canceled; already submitted messages remain                   |
| Link expires                             | Coordinates inaccessible even before cleanup worker runs                                     |
| Police opt-out or missing partner        | No police submission and explicit unavailable status                                         |
| Partner opt-in, in range, valid location | One authenticated submission to coordinated sandbox; never claim dispatch                    |
| Large font, screen reader, one hand      | SOS reachable, legible labels, no inaccessible required confirmation                         |
| Six contacts and weak connection         | Measure tap-to-server, provider acceptance, receipt, and human acknowledgement separately    |

Target delivery latency is a measured engineering objective, not an emergency-response guarantee. Maintain a supported-device matrix and record test dates/build numbers.
