"""Local Pipecat voice prototype; no telephone carrier is enabled."""
import sys
from loguru import logger

# Pipecat debug logs can include transcripts. Keep them off by default.
logger.remove()
logger.add(sys.stderr, level="WARNING")
