import unittest
from unittest.mock import patch

from app.loader import process_file


class _Page:
    def __init__(self, text):
        self._text = text

    def extract_text(self):
        return self._text


class _Reader:
    def __init__(self, _stream):
        self.pages = [_Page(None), _Page("Second page")]


class LoaderTests(unittest.IsolatedAsyncioTestCase):
    async def test_process_text_file(self):
        result = await process_file(b"hello world", "notes.txt")
        self.assertEqual(result, "hello world")

    async def test_process_invalid_text_file(self):
        result = await process_file(b"\xff\xfe", "notes.txt")
        self.assertEqual(result, "Error: Could not decode text file.")

    async def test_process_pdf_handles_pages_without_text(self):
        with patch("app.loader.PdfReader", _Reader):
            result = await process_file(b"%PDF", "paper.pdf")

        self.assertEqual(result, "Second page")


if __name__ == "__main__":
    unittest.main()
