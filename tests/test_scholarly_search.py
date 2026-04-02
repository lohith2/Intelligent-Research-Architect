import unittest

from app.scholarly_search import build_nearby_topic_queries, extract_year_constraints, rank_sources


class ScholarlySearchTests(unittest.TestCase):
    def test_recent_query_filters_off_topic_high_signal_paper(self):
        results = [
            {
                "title": "Opinion Paper: So what if ChatGPT wrote it?",
                "url": "https://doi.org/example-chatgpt",
                "snippet": "International Journal of Information Management | generative conversational AI",
                "provider": "OpenAlex",
                "authors": "A. Author",
                "year": "2023",
                "venue": "International Journal of Information Management",
                "abstract": "A paper about ChatGPT and generative conversational AI.",
                "citation_count": 3364,
                "paper_role": "method",
                "provenance": "seed",
            },
            {
                "title": "Robotics Foundation Models for Manipulation and Navigation",
                "url": "https://arxiv.org/abs/2501.00001",
                "snippet": "arXiv | 2025 | robotics manipulation navigation foundation models",
                "provider": "arXiv",
                "authors": "R. Researcher",
                "year": "2025",
                "venue": "arXiv",
                "abstract": "A recent robotics paper covering manipulation and navigation.",
                "citation_count": 12,
                "paper_role": "method",
                "provenance": "seed",
            },
        ]

        ranked = rank_sources("recent papers on robotics", results, limit=5)
        titles = [item["title"] for item in ranked]

        self.assertIn("Robotics Foundation Models for Manipulation and Navigation", titles)
        self.assertNotIn("Opinion Paper: So what if ChatGPT wrote it?", titles)

    def test_recent_query_sets_last_three_year_window(self):
        constraints = extract_year_constraints("recent papers on robotics")
        self.assertEqual(constraints["min_year"], 2023)
        self.assertIsNone(constraints["max_year"])

    def test_recently_query_sets_last_three_year_window(self):
        constraints = extract_year_constraints("papers on robotics published recently")
        self.assertEqual(constraints["min_year"], 2023)
        self.assertIsNone(constraints["max_year"])

    def test_recent_filter_prefers_newer_matching_paper(self):
        results = [
            {
                "title": "Robotics Planning Survey",
                "url": "https://example.org/older-robotics",
                "snippet": "A robotics survey",
                "provider": "Crossref",
                "authors": "R. Older",
                "year": "2022",
                "venue": "ICRA",
                "abstract": "Robotics planning systems.",
                "citation_count": 500,
                "paper_role": "survey",
                "provenance": "seed",
            },
            {
                "title": "Recent Robotics Planning Survey",
                "url": "https://example.org/newer-robotics",
                "snippet": "A recent robotics survey",
                "provider": "Crossref",
                "authors": "R. Newer",
                "year": "2025",
                "venue": "ICRA",
                "abstract": "Recent robotics planning systems.",
                "citation_count": 15,
                "paper_role": "survey",
                "provenance": "seed",
            },
        ]

        ranked = rank_sources("robotics planning survey", results, limit=2, filters=["recent", "survey"])

        self.assertEqual(ranked[0]["title"], "Recent Robotics Planning Survey")

    def test_broad_robotics_query_expands_to_nearby_subtopics(self):
        nearby_queries = build_nearby_topic_queries("recent papers on robotics", filters=["recent"])
        self.assertIn("robot manipulation recent state of the art", nearby_queries)
        self.assertIn("robot navigation recent state of the art", nearby_queries)


if __name__ == "__main__":
    unittest.main()
