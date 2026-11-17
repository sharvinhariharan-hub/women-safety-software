# Pipecat voice prototype

This is an actual **Pipecat 1.16 pipeline**, using a constrained incident responder. It supports local text simulation and an optional local browser speech setup. It **does not place telephone calls or contact police**. No carrier or paid AI API is enabled. The mobile app explicitly reports telephone calls as not connected.

The pipeline is:

```text
Local WebRTC microphone → Silero VAD → local Whisper STT
→ incident responder → local Piper HTTP speech → browser audio
```

Instead of a generative LLM, this first voice version uses a limited set of grounded responses for name, coordinates, incident details, and dispatch questions. It does not invent suspects, injuries, weapons, streets, or landmarks. It identifies itself as automated, explicitly labels test alerts, and never claims that help was dispatched. English is the initial supported conversation language. This is a constrained prototype, not a validated multilingual dispatch conversation agent.

## Free local conversation test

Use Python 3.12 from the repository root:

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r voice_agent/requirements.txt
.venv/bin/python -m voice_agent.simulate --question 'Where is the person?' --question 'Who is involved?'
.venv/bin/python -m unittest discover -s voice_agent/tests -v
```

Without backend configuration, a clearly labelled fictional test incident is used. The simulator injects transcription frames into the real Pipecat pipeline and prints the spoken responses. It makes no telephone calls and uses no external speech or model APIs. It does not validate microphone quality or speech recognition.

## Optional browser speech

Install the speech extras:

```sh
.venv/bin/pip install -r voice_agent/requirements-voice.txt
```

Run a **separately installed Piper HTTP server** on loopback, following [Piper's HTTP server setup](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_HTTP.md), and configure a voice model. The default endpoint expected here is `http://127.0.0.1:5000/synthesize`. Set `PIPER_HTTP_URL` to a different loopback endpoint if needed. Keep that server local. Piper and its voices have their own licenses; this repository does not bundle their runtime or voice weights.

Start the Pipecat development runner:

```sh
.venv/bin/python -m voice_agent.bot --host 127.0.0.1 --port 7860 --transport webrtc
```

Open `http://127.0.0.1:7860/client/` locally and grant microphone access for the test. Whisper's `base.en` model downloads on first use; `WHISPER_MODEL` can select a preinstalled compatible model. Both STT and TTS then use local compute, not paid AI APIs. The optional speech dependencies and runner imports are checked, but microphone/voice quality and physical-device behavior still need human testing.

The development runner is deliberately **local-only**. Do not expose it publicly or enable telephony transports: it has no production session authentication. Production voice would need an authenticated dispatcher, operational monitoring, and a carrier/agency connection. The bot rejects transports other than local browser WebRTC.

## Connect an active incident

Set these three private environment variables together before launching the simulator or browser bot:

- `VOICE_BACKEND_URL`: backend origin. Use HTTPS remotely; loopback HTTP is allowed for local development.
- `VOICE_OWNER_TOKEN`: existing backend owner credential. Never send it to a contact or browser client.
- `VOICE_INCIDENT_ID`: active incident UUID from the owner API.

The responder fetches `GET /api/incidents/:id/voice-brief` afresh for every conversational turn. It receives no contact list or private sharing token. This credential is powerful because the current backend is single-owner; keep the process on a trusted machine. HTTP redirects are not followed with the token.

If the backend becomes unreachable, the alert expires, or sharing ends, the next response says details are unavailable instead of repeating cached coordinates. This cannot retract audio that was already heard. Location readings include their timestamp and accuracy; readings older than 60 seconds are explicitly described as stale. If an operator-configured geocoder supplied an approximate map label for that exact fix, it is spoken as approximate, not a verified landmark.

Debug/transcript logging is disabled by default. The text simulator intentionally prints the answers locally; do not capture sensitive real-incident output into public logs or issues.

## Connecting telephone calls later

Pipecat is the speech/conversation layer, not a free telephone network. Adding automatic calls requires a supported carrier connection and an agreed receiving workflow. Indian 100/112 routing cannot be assumed to work through a generic cloud telephony API. No short emergency number, real agency number, or telephone dial-out endpoint exists in this prototype.

The existing agency webhook remains separate from voice. Enabling it does not enable an AI phone call. Testing a real receiving agency requires prior coordination; browser or simulator tests do not establish emergency dispatch readiness.

References: [Pipecat first agent](https://docs.pipecat.ai/pipecat/learn/your-first-agent.md), [local development runner](https://docs.pipecat.ai/pipecat/deployment/running-bots-locally.md), [Whisper](https://docs.pipecat.ai/api-reference/server/services/stt/whisper.md), [telephony architecture](https://docs.pipecat.ai/pipecat/telephony/overview.md).
