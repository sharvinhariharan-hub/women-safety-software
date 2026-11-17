"""Use a separately hosted Piper HTTP server without bundling its GPL runtime."""
import io
import wave
from urllib.parse import urlsplit
import aiohttp
from pipecat.frames.frames import ErrorFrame, TTSAudioRawFrame
from pipecat.services.tts_service import TTSService


class LocalPiperTTS(TTSService):
    def __init__(self, endpoint="http://127.0.0.1:5000/synthesize", **kwargs):
        parsed = urlsplit(endpoint)
        if parsed.scheme != "http" or parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            raise ValueError("Piper speech endpoint must be on loopback for this local prototype")
        super().__init__(push_start_frame=True, push_stop_frames=True, **kwargs)
        self.endpoint = endpoint

    async def run_tts(self, text, context_id):
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
                async with session.post(self.endpoint, json={"text": text}, allow_redirects=False) as result:
                    result.raise_for_status()
                    data = await result.read()
            with wave.open(io.BytesIO(data), "rb") as audio:
                if audio.getnchannels() != 1 or audio.getsampwidth() != 2:
                    raise ValueError("Piper must return mono 16-bit WAV")
                sample_rate = audio.getframerate()
                pcm = audio.readframes(audio.getnframes())
            yield TTSAudioRawFrame(audio=pcm, sample_rate=sample_rate, num_channels=1, context_id=context_id)
        except Exception:
            # Never put incident text in error logs.
            yield ErrorFrame(error="Local speech synthesis unavailable")
