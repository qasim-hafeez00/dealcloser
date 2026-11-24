import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel  # noqa: E402


class ScriptedModel(GenericFakeChatModel):
    """Fake chat model that returns scripted AIMessages (tool calls included) and ignores tools."""

    def bind_tools(self, tools, **kwargs):
        return self
