"""Local browser speech prototype. It does not accept or place telephone calls."""
import os
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.workers.runner import WorkerRunner
from pipecat.frames.frames import TTSSpeakFrame
from voice_agent.facts import BriefSource, response
from voice_agent.pipeline import IncidentResponder
from voice_agent.local_tts import LocalPiperTTS


async def bot(runner_args):
    # Optional speech dependencies are only loaded for the microphone version.
    from pipecat.runner.types import SmallWebRTCRunnerArguments
    from pipecat.runner.utils import create_transport
    from pipecat.transports.base_transport import TransportParams
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.processors.audio.vad_processor import VADProcessor
    from pipecat.services.whisper.stt import WhisperSTTService
    if not isinstance(runner_args, SmallWebRTCRunnerArguments):
        raise ValueError("Only local browser WebRTC is enabled; no telephone transport")
    source = BriefSource.from_env()
    transport = await create_transport(runner_args, {"webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True)})
    stt = WhisperSTTService(device="cpu", compute_type="int8", settings=WhisperSTTService.Settings(model=os.getenv("WHISPER_MODEL", "base.en")))
    tts = LocalPiperTTS(endpoint=os.getenv("PIPER_HTTP_URL", "http://127.0.0.1:5000/synthesize"))
    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)
    worker = PipelineWorker(Pipeline([transport.input(), VADProcessor(vad_analyzer=SileroVADAnalyzer()), stt, IncidentResponder(source), tts, transport.output()]),
                            params=PipelineParams(audio_in_sample_rate=16000, audio_out_sample_rate=24000), enable_turn_tracking=False)

    @transport.event_handler("on_client_connected")
    async def connected(transport, client):
        import asyncio
        brief = await asyncio.to_thread(source.read)
        await worker.queue_frame(TTSSpeakFrame(response(brief), append_to_context=False))

    @transport.event_handler("on_client_disconnected")
    async def disconnected(transport, client):
        await runner.cancel()

    await runner.add_workers(worker)
    await runner.run()


if __name__ == "__main__":
    from pipecat.runner.run import main
    main()
