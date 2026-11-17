"""Pipecat processor shared by real speech and headless conversation tests."""
import asyncio
from pipecat.frames.frames import TranscriptionFrame, TTSSpeakFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from voice_agent.facts import response


class IncidentResponder(FrameProcessor):
    def __init__(self, source, **kwargs):
        super().__init__(**kwargs)
        self.source = source

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame) and direction == FrameDirection.DOWNSTREAM:
            brief = await asyncio.to_thread(self.source.read)
            await self.push_frame(TTSSpeakFrame(response(brief, frame.text), append_to_context=False))
        else:
            await self.push_frame(frame, direction)
