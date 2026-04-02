import json
import unittest

from app.main import Message, ResearchRequest, stream_research_events


class _Chunk:
    def __init__(self, content):
        self.content = content


class _FakeRunnable:
    def __init__(self, events):
        self._events = events

    async def astream_events(self, initial_state, version="v2"):
        for event in self._events:
            yield event


class StreamingTests(unittest.IsolatedAsyncioTestCase):
    async def _collect_payloads(self, events):
        request = ResearchRequest(query="test", messages=[Message(role="user", content="hi")])
        payloads = []
        async for payload in stream_research_events(request, runnable=_FakeRunnable(events)):
            payloads.append(json.loads(payload))
        return payloads

    async def test_streaming_does_not_duplicate_final_answer_when_tokens_streamed(self):
        payloads = await self._collect_payloads(
            [
                {"event": "on_chat_model_stream", "data": {"chunk": _Chunk("Hel")}},
                {"event": "on_chat_model_stream", "data": {"chunk": _Chunk("lo")}},
                {
                    "event": "on_chain_end",
                    "name": "generate",
                    "data": {"output": {"answer": "Hello"}},
                },
            ]
        )

        tokens = [payload["token"] for payload in payloads if "token" in payload]
        self.assertEqual(tokens, ["Hel", "lo"])
        self.assertEqual(payloads[-1], {"done": True})

    async def test_streaming_sends_final_answer_when_model_did_not_stream_tokens(self):
        payloads = await self._collect_payloads(
            [
                {
                    "event": "on_chain_end",
                    "name": "generate",
                    "data": {"output": {"answer": "Fallback answer"}},
                },
            ]
        )

        tokens = [payload["token"] for payload in payloads if "token" in payload]
        self.assertEqual(tokens, ["Fallback answer"])

    async def test_streaming_reports_source_count_and_payload(self):
        payloads = await self._collect_payloads(
            [
                {
                    "event": "on_chain_end",
                    "name": "search",
                    "data": {"output": {"sources": [{"title": "Paper", "url": "https://example.org", "snippet": ""}]}},
                },
            ]
        )

        self.assertIn(
            {"step": {"name": "search", "status": "done", "label": "Found 1 sources"}},
            payloads,
        )
        self.assertIn(
            {"sources": [{"title": "Paper", "url": "https://example.org", "snippet": ""}]},
            payloads,
        )


if __name__ == "__main__":
    unittest.main()
