"""Run the actual Pipecat pipeline with text in place of a microphone. No calls."""
import argparse
import asyncio
from pipecat.frames.frames import EndFrame, TranscriptionFrame, TTSSpeakFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineWorker
from pipecat.workers.runner import WorkerRunner
from pipecat.processors.frame_processor import FrameProcessor
from voice_agent.facts import BriefSource
from voice_agent.pipeline import IncidentResponder


class Collector(FrameProcessor):
    def __init__(self):
        super().__init__()
        self.answers = []

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if isinstance(frame, TTSSpeakFrame):
            self.answers.append(frame.text)
        await self.push_frame(frame, direction)


async def simulate(questions, source=None):
    collector = Collector()
    runner = WorkerRunner(handle_sigint=False)
    worker = PipelineWorker(Pipeline([IncidentResponder(source or BriefSource()), collector]),
                            enable_rtvi=False, enable_turn_tracking=False, idle_timeout_secs=None)
    await runner.add_workers(worker)
    await worker.queue_frames([*(TranscriptionFrame(text=q, user_id="local-tester", timestamp="") for q in questions), EndFrame()])
    await asyncio.wait_for(runner.run(), timeout=20)
    return collector.answers


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local Pipecat conversation simulation; never places a telephone call")
    parser.add_argument("--question", action="append", default=[])
    args = parser.parse_args()
    for answer in asyncio.run(simulate(args.question or ["hello", "where is the person?", "who is involved?"])):
        print(answer)
