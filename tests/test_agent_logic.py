import unittest
from unittest.mock import AsyncMock, patch

from app.agent import generate_node, router_node, search_node


class AgentLogicTests(unittest.IsolatedAsyncioTestCase):
    async def test_router_treats_follow_up_complaint_as_chat(self):
        result = await router_node(
            {
                "question": "why didnt you give them earlier",
                "chat_history": [
                    {"role": "user", "content": "give me paper on robotics published in the past few years"},
                    {"role": "assistant", "content": "I couldn't find enough relevant scholarly sources."},
                ],
                "filters": [],
            }
        )

        self.assertEqual(result["current_step"], "routing_chat")

    async def test_router_does_not_treat_pasted_pdf_tokens_as_document_query(self):
        result = await router_node(
            {
                "question": "give me paper on robotics published in the past few years [pdf, html, other]",
                "chat_history": [],
                "filters": [],
            }
        )

        self.assertEqual(result["current_step"], "routing_web")
        self.assertEqual(result["research_mode"], "academic")

    async def test_generate_node_refuses_unsourced_academic_summary(self):
        state = {
            "question": "recent papers on e commerce",
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
        self.assertIn("couldn't find enough relevant scholarly sources", result["answer"].lower())
        self.assertIn("e commerce", result["answer"].lower())
        self.assertNotIn("diffusion", result["answer"].lower())
        self.assertEqual(result["sources"], [])

    async def test_search_node_uses_nearby_robotics_queries_when_initial_results_are_sparse(self):
        def provider_side_effect(query):
            if "robot manipulation" in query or "robot navigation" in query:
                return [
                    {
                        "title": "Recent Robot Manipulation Policies",
                        "url": "https://arxiv.org/abs/2501.00002",
                        "snippet": "robot manipulation policies",
                        "provider": "arXiv",
                        "authors": "R. Researcher",
                        "year": "2025",
                        "venue": "arXiv",
                        "abstract": "A recent robotics manipulation paper.",
                        "citation_count": 3,
                        "paper_role": "method",
                        "provenance": "seed",
                    }
                ]
            return []

        def named_provider(name):
            def _provider(query):
                return provider_side_effect(query)
            _provider.__name__ = name
            return _provider

        state = {
            "question": "give me few papers on robotics which were published recently",
            "research_mode": "academic",
            "filters": ["recent"],
            "chat_id": "chat-2",
            "context": [],
            "steps_taken": [],
        }

        with patch("app.agent.search_semantic_scholar", new=named_provider("search_semantic_scholar")), patch(
            "app.agent.search_openalex", new=named_provider("search_openalex")
        ), patch("app.agent.search_arxiv", new=named_provider("search_arxiv")), patch(
            "app.agent.search_crossref", new=named_provider("search_crossref")
        ), patch("app.agent.fetch_openalex_related_works", return_value=[]), patch(
            "app.agent.add_documents", new=AsyncMock()
        ), patch("app.agent.tavily.search", return_value={"results": []}):
            result = await search_node(state)

        self.assertTrue(result["sources"])
        self.assertEqual(result["sources"][0]["title"], "Recent Robot Manipulation Policies")


if __name__ == "__main__":
    unittest.main()
