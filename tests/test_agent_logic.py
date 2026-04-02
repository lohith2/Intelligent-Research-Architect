import unittest
from unittest.mock import AsyncMock, patch

from app.agent import generate_node


class AgentLogicTests(unittest.IsolatedAsyncioTestCase):
    async def test_generate_node_refuses_unsourced_academic_summary(self):
        state = {
            "question": "Summarize recent robotics papers",
            "chat_id": "chat-1",
            "research_mode": "academic",
            "filters": ["recent"],
            "chat_history": [],
            "context": [],
            "steps_taken": [],
            "sources": [],
            "grade_passed": False,
        }

        with patch("app.agent.add_documents", new=AsyncMock()) as add_documents_mock, patch(
            "app.agent.search_documents", new=AsyncMock(return_value=[])
        ):
            result = await generate_node(state)

        add_documents_mock.assert_awaited()
        self.assertIn("couldn't find relevant scholarly sources", result["answer"].lower())
        self.assertEqual(result["sources"], [])


if __name__ == "__main__":
    unittest.main()
