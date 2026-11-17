# Device acceptance plan

Status: **not executed on physical devices for v0.4.0**. Never rely on this release for real emergencies until its behavior has been validated for the supported devices and deployment.

Use test mode and fictional contacts first. Coordinate a separate live SMS test with consenting recipients; do not contact police or emergency dispatch as an unannounced test.

| Scenario                                 | Expected observation                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Prepared app, two-second hold           | One incident, one job per selected channel, no second confirmation                           |
| GPS slow or denied                       | SOS still created; location unavailable is explicit                                          |
| Repeated taps or API timeout             | Same active incident; no duplicate initial SMS                                               |
| Server unreachable                       | Unconfirmed request persisted; visible retry state; no claim of delivery                     |
| App reopened after offline request       | Existing incident recovered; fresh hold required to authorize retry                                         |
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

Additional v0.4 native checks (not yet executed): contact picker grant/cancel/deny/limited access; multiple phone numbers and international formatting; manual-entry fallback; location services off; foreground-only and permanent denial; background OS settings handoff; camera denial without microphone prompt; microphone denial; setup grants without recording; explicit start/stop, 120-second/50-MiB cap, app background/unmount/call interruption, low storage, file save failure, durable clip list, explicit export, and delete confirmation. Verify SOS submission/tracking continues independently of recording and denial.
