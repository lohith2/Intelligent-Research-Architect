from googlesearch import search
import json

def test_search():
    print("Testing Google Search...")
    try:
        results = []
        # advanced=True yields title/desc? "googlesearch-python" provides `search(..., advanced=True)`
        for r in search("latest version of angular", num_results=3, advanced=True):
            print(f"Result: {r.title} - {r.description}")
            results.append({"title": r.title, "body": r.description, "href": r.url})
        
        print(f"Success! Found {len(results)} results.")
        print(json.dumps(results, indent=2))
    except Exception as e:
        print(f"SEARCH FAILED: {e}")

if __name__ == "__main__":
    test_search()
