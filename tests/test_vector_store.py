import unittest

from app.vector_store import search_documents


class VectorStoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_search_documents_requires_chat_id(self):
        result = await search_documents("robotics")
        self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()
