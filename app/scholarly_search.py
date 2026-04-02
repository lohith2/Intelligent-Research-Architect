import json
import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "for",
    "from",
    "how",
    "i",
    "important",
    "in",
    "into",
    "is",
    "know",
    "me",
    "most",
    "of",
    "on",
    "open",
    "or",
    "papers",
    "phd",
    "recent",
    "should",
    "student",
    "students",
    "the",
    "their",
    "to",
    "what",
    "which",
}

CURRENT_YEAR = 2026
TRUSTED_VENUE_KEYWORDS = [
    "neurips",
    "advances in neural information processing systems",
    "iclr",
    "icml",
    "acl",
    "naacl",
    "emnlp",
    "tmlr",
    "transactions on machine learning research",
    "jmlr",
    "journal of machine learning research",
    "ieee access",
    "nature",
    "science",
    "acm",
    "aaai",
    "openreview",
    "arxiv",
]
LOW_TRUST_VENUE_KEYWORDS = [
    "unknown venue",
    "techrxiv",
    "journal scientific and applied informatics",
]
EXCLUSION_TERMS_BY_TOPIC = {
    "retrieval augmented generation": [
        "image generation",
        "vision",
        "video",
        "gravitational waves",
        "neutrinos",
        "cognitive augmentation",
    ],
    "mechanistic interpretability": [
        "financial engineering",
        "vision and video",
        "gravitational waves",
        "medical imaging",
    ],
}

RESEARCH_FILTERS = {"recent", "survey", "benchmark", "seminal"}


def _normalize_filters(filters: Optional[List[str]]) -> List[str]:
    if not filters:
        return []
    return [item for item in {str(value).lower().strip() for value in filters} if item in RESEARCH_FILTERS]


def extract_academic_intent(query: str, filters: Optional[List[str]] = None) -> Dict[str, Any]:
    lowered = query.lower()
    normalized = normalize_query(query)
    normalized_filters = _normalize_filters(filters)
    wants_survey = "survey" in normalized_filters or any(
        term in lowered for term in ["survey", "review", "systematic review", "seminal"]
    )
    wants_benchmark = "benchmark" in normalized_filters or any(
        term in lowered for term in ["benchmark", "benchmarks", "evaluation", "dataset", "datasets"]
    )
    wants_recent = "recent" in normalized_filters or any(
        term in lowered for term in ["recent", "latest", "since", "current"]
    )
    wants_seminal = "seminal" in normalized_filters or "seminal" in lowered
    topic = normalized
    if "retrieval augmented generation" in lowered or "rag" in lowered:
        topic = "retrieval augmented generation evaluation"
    elif "mechanistic interpretability" in lowered:
        topic = "mechanistic interpretability transformers"
    return {
        "topic": topic,
        "wants_survey": wants_survey,
        "wants_benchmark": wants_benchmark,
        "wants_recent": wants_recent,
        "wants_seminal": wants_seminal,
        "filters": normalized_filters,
    }


def build_provider_queries(query: str, filters: Optional[List[str]] = None) -> Dict[str, str]:
    intent = extract_academic_intent(query, filters=filters)
    topic = intent["topic"]
    survey_terms = " survey review systematic review" if intent["wants_survey"] else ""
    benchmark_terms = " benchmark evaluation dataset leaderboard" if intent["wants_benchmark"] else ""
    recent_terms = " recent state of the art" if intent["wants_recent"] else ""
    seminal_terms = " seminal influential highly cited" if intent["wants_seminal"] else ""
    base = f"{topic}{survey_terms}{benchmark_terms}{recent_terms}{seminal_terms}".strip()
    return {
        "semantic_scholar": base,
        "openalex": f"{base} primary study".strip(),
        "arxiv": f"{topic}{benchmark_terms}{survey_terms}{recent_terms}".strip(),
        "crossref": f"{topic}{survey_terms}{benchmark_terms}{seminal_terms}".strip(),
    }


def _read_json(url: str, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def _read_text(url: str, headers: Optional[Dict[str, str]] = None) -> str:
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="ignore")


def _clean_text(value: Optional[str], max_len: int = 320) -> str:
    if not value:
        return ""
    text = " ".join(value.replace("\n", " ").replace("\r", " ").split())
    return text[:max_len]


def _openalex_work_id_from_url(url: str) -> str:
    if not url:
        return ""
    if "openalex.org/" in url:
        return url.rstrip("/").split("/")[-1]
    return ""


def _format_authors(authors: List[str], max_authors: int = 4) -> str:
    if not authors:
        return "Unknown authors"
    shown = authors[:max_authors]
    suffix = " et al." if len(authors) > max_authors else ""
    return ", ".join(shown) + suffix


def _abstract_from_inverted_index(index: Dict[str, List[int]]) -> str:
    if not index:
        return ""
    positions: Dict[int, str] = {}
    for token, token_positions in index.items():
        for pos in token_positions:
            positions[pos] = token
    return " ".join(token for _, token in sorted(positions.items()))


def classify_paper_role(item: Dict[str, Any]) -> str:
    haystack = " ".join(
        [
            str(item.get("title", "")).lower(),
            str(item.get("snippet", "")).lower(),
            str(item.get("abstract", "")).lower(),
            str(item.get("venue", "")).lower(),
        ]
    )
    if any(keyword in haystack for keyword in ["survey", "systematic review", "review paper", "comprehensive review"]):
        return "survey"
    if any(keyword in haystack for keyword in ["benchmark", "dataset", "evaluation", "leaderboard"]):
        return "benchmark"
    if any(keyword in haystack for keyword in ["toolkit", "framework", "interface", "library"]):
        return "tooling"
    if any(keyword in haystack for keyword in ["application", "case study", "domain-specific", "financial", "medical"]):
        return "application"
    return "method"


def _is_related_candidate_relevant(query: str, item: Dict[str, Any]) -> bool:
    score = _score_source(query, item)
    role = item.get("paper_role") or classify_paper_role(item)
    lowered_query = query.lower()
    if score < 4:
        return False
    if any(term in lowered_query for term in ["benchmark", "survey", "review", "evaluation"]) and role == "application":
        return False
    if role == "application" and score < 6:
        return False
    return True


def _topic_exclusion_hit(query: str, item: Dict[str, Any]) -> bool:
    normalized_query = normalize_query(query)
    haystack = " ".join(
        [
            str(item.get("title", "")).lower(),
            str(item.get("snippet", "")).lower(),
            str(item.get("abstract", "")).lower(),
            str(item.get("venue", "")).lower(),
        ]
    )
    for topic, exclusions in EXCLUSION_TERMS_BY_TOPIC.items():
        if topic in normalized_query:
            for term in exclusions:
                if term in haystack:
                    return True
    return False


def _venue_trust_score(item: Dict[str, Any]) -> int:
    venue = str(item.get("venue", "")).lower()
    provider = str(item.get("provider", "")).lower()
    combined = f"{venue} {provider}"
    score = 0
    if any(keyword in combined for keyword in TRUSTED_VENUE_KEYWORDS):
        score += 2
    if any(keyword in combined for keyword in LOW_TRUST_VENUE_KEYWORDS):
        score -= 2
    return score


def _has_strong_quality_signal(item: Dict[str, Any]) -> bool:
    citation_count = item.get("citation_count", 0) or 0
    role = item.get("paper_role") or classify_paper_role(item)
    trust = _venue_trust_score(item)
    return citation_count >= 20 or trust > 0 or role in {"survey", "benchmark"}


def _canonicalize_token(token: str) -> str:
    token = (token or "").lower().strip()
    if len(token) > 4 and token.endswith("s"):
        return token[:-1]
    return token


def _query_overlap_count(query: str, item: Dict[str, Any]) -> int:
    normalized_query = normalize_query(query)
    query_tokens = {_canonicalize_token(token) for token in re.findall(r"[a-z0-9]+", normalized_query)}
    haystack_tokens = {
        _canonicalize_token(token)
        for token in re.findall(
            r"[a-z0-9]+",
            " ".join(
                [
                    str(item.get("title", "")).lower(),
                    str(item.get("snippet", "")).lower(),
                    str(item.get("abstract", "")).lower(),
                    str(item.get("venue", "")).lower(),
                ]
            ),
        )
    }
    query_tokens = {token for token in query_tokens if token}
    haystack_tokens = {token for token in haystack_tokens if token}
    return len(query_tokens & haystack_tokens)


def _has_min_topic_overlap(query: str, item: Dict[str, Any]) -> bool:
    normalized_query = normalize_query(query)
    query_tokens = [_canonicalize_token(token) for token in re.findall(r"[a-z0-9]+", normalized_query)]
    query_tokens = [token for token in query_tokens if token]
    if not query_tokens:
        return True

    overlap = _query_overlap_count(query, item)
    required_overlap = 1 if len(set(query_tokens)) <= 2 else 2
    return overlap >= required_overlap


def _is_seed_candidate_relevant(query: str, item: Dict[str, Any]) -> bool:
    lowered_query = query.lower()
    normalized_query = normalize_query(query)
    haystack = " ".join(
        [
            str(item.get("title", "")).lower(),
            str(item.get("snippet", "")).lower(),
            str(item.get("abstract", "")).lower(),
            str(item.get("venue", "")).lower(),
        ]
    )
    role = item.get("paper_role") or classify_paper_role(item)

    if _topic_exclusion_hit(query, item):
        return False

    if not _has_min_topic_overlap(query, item):
        return False

    if "retrieval augmented generation" in normalized_query and "retrieval augmented generation" not in haystack:
        return False
    if "mechanistic interpretability" in normalized_query and "mechanistic interpretability" not in haystack:
        return False

    if any(term in lowered_query for term in ["benchmark", "benchmarks", "evaluation", "dataset", "datasets"]):
        if role not in {"benchmark", "survey", "method"}:
            return False
        if role == "method" and not _has_strong_quality_signal(item):
            return False

    if any(term in lowered_query for term in ["survey", "review", "seminal"]):
        if role == "application":
            return False
        if role not in {"survey", "benchmark", "method"} and not _has_strong_quality_signal(item):
            return False

    if role == "application" and not _has_strong_quality_signal(item):
        return False

    venue = str(item.get("venue", "")).lower()
    if any(keyword in venue for keyword in LOW_TRUST_VENUE_KEYWORDS) and not _has_strong_quality_signal(item):
        return False

    return True


def normalize_query(query: str) -> str:
    tokens = re.findall(r"[a-z0-9]+", query.lower())
    filtered = [token for token in tokens if token not in STOPWORDS and len(token) > 2]
    return " ".join(filtered[:12]) or query


def extract_year_constraints(query: str) -> Dict[str, Optional[int]]:
    years = sorted({int(match) for match in re.findall(r"\b(19\d{2}|20\d{2})\b", query)})
    lowered = query.lower()
    min_year: Optional[int] = None
    max_year: Optional[int] = None

    if len(years) >= 2:
        min_year, max_year = years[0], years[-1]
    elif len(years) == 1:
        year = years[0]
        if any(phrase in lowered for phrase in ["since", "after", "from", "newer than"]):
            min_year = year
        elif any(phrase in lowered for phrase in ["before", "until", "older than"]):
            max_year = year
        else:
            min_year = year
            max_year = year
    elif any(phrase in lowered for phrase in ["recent", "latest", "state of the art", "current"]):
        min_year = CURRENT_YEAR - 3

    return {"min_year": min_year, "max_year": max_year}


def _within_year_constraints(item: Dict[str, str], constraints: Dict[str, Optional[int]]) -> bool:
    year_str = item.get("year", "")
    try:
        year = int(year_str)
    except (TypeError, ValueError):
        return constraints.get("min_year") is None and constraints.get("max_year") is None

    min_year = constraints.get("min_year")
    max_year = constraints.get("max_year")
    if min_year is not None and year < min_year:
        return False
    if max_year is not None and year > max_year:
        return False
    return True


def _score_source(query: str, item: Dict[str, str], filters: Optional[List[str]] = None) -> int:
    normalized_query = normalize_query(query)
    normalized_filters = _normalize_filters(filters)
    query_tokens = set(re.findall(r"[a-z0-9]+", normalized_query))
    haystack = " ".join(
        [
            item.get("title", "").lower(),
            item.get("snippet", "").lower(),
            item.get("abstract", "").lower(),
            item.get("venue", "").lower(),
        ]
    )
    score = 0
    for token in query_tokens:
        if token in haystack:
            score += 3 if token in item.get("title", "").lower() else 1

    overlap = _query_overlap_count(query, item)
    if overlap == 0:
        score -= 8
    elif overlap >= 2:
        score += 2

    if _topic_exclusion_hit(query, item):
        score -= 8

    if "retrieval augmented generation" in normalized_query and "retrieval augmented generation" in haystack:
        score += 4
    if "mechanistic interpretability" in normalized_query and "mechanistic interpretability" in haystack:
        score += 4

    # Favor stronger scholarly signals.
    if "survey" in haystack or "systematic review" in haystack:
        score += 2
    if "benchmark" in haystack or "dataset" in haystack or "evaluation" in haystack:
        score += 2
    role = item.get("paper_role") or classify_paper_role(item)
    lowered_query = query.lower()
    if any(term in lowered_query for term in ["survey", "review", "seminal"]):
        if role == "survey":
            score += 4
        elif role == "application":
            score -= 3
    if any(term in lowered_query for term in ["benchmark", "benchmarks", "evaluation", "dataset", "datasets"]):
        if role == "benchmark":
            score += 4
        elif role == "application":
            score -= 4
    if "reading path" in lowered_query and role == "survey":
        score += 2
    if "survey" in normalized_filters:
        if role == "survey":
            score += 5
        elif role == "application":
            score -= 3
    if "benchmark" in normalized_filters:
        if role == "benchmark":
            score += 5
        elif role == "application":
            score -= 3
    score += _venue_trust_score(item)
    citation_count = item.get("citation_count", 0) or 0
    if citation_count >= 500:
        score += 3
    elif citation_count >= 100:
        score += 2
    elif citation_count >= 20:
        score += 1
    year_str = item.get("year", "")
    try:
        year = int(year_str)
        if "recent" in query.lower() or "latest" in query.lower():
            score += max(0, year - (CURRENT_YEAR - 5))
        if "recent" in normalized_filters:
            score += max(0, year - (CURRENT_YEAR - 4)) * 2
    except (TypeError, ValueError):
        pass
    if "seminal" in normalized_filters:
        if citation_count >= 1000:
            score += 5
        elif citation_count >= 250:
            score += 3
        elif citation_count >= 50:
            score += 1
    return score


def search_semantic_scholar(query: str, limit: int = 4) -> List[Dict[str, str]]:
    fields = ",".join(
        [
            "title",
            "abstract",
            "year",
            "authors",
            "url",
            "venue",
            "citationCount",
            "openAccessPdf",
            "publicationTypes",
        ]
    )
    url = (
        "https://api.semanticscholar.org/graph/v1/paper/search?"
        + urllib.parse.urlencode({"query": query, "limit": limit, "fields": fields})
    )
    headers: Dict[str, str] = {"User-Agent": "ResearchArchitect/1.0"}
    api_key = os.getenv("SEMANTIC_SCHOLAR_API_KEY")
    if api_key:
        headers["x-api-key"] = api_key

    payload = _read_json(url, headers=headers)
    results = []
    for item in payload.get("data", []):
        authors = [author.get("name", "") for author in item.get("authors", []) if author.get("name")]
        pdf_url = (item.get("openAccessPdf") or {}).get("url")
        landing_url = item.get("url") or pdf_url or ""
        year = item.get("year") or "n.d."
        venue = item.get("venue") or "Unknown venue"
        citation_count = item.get("citationCount", 0)
        abstract = _clean_text(item.get("abstract"))
        snippet = _clean_text(
            f"Semantic Scholar | {year} | {venue} | Citations: {citation_count} | "
            f"{_format_authors(authors)} | {abstract}",
            max_len=360,
        )
        if item.get("title") and landing_url:
            results.append(
                {
                    "title": item["title"],
                    "url": landing_url,
                    "snippet": snippet,
                    "provider": "Semantic Scholar",
                    "authors": _format_authors(authors),
                    "year": str(year),
                    "venue": venue,
                    "abstract": abstract,
                    "doi": "",
                    "citation_count": citation_count,
                    "pdf_url": pdf_url or "",
                    "source_type": "paper",
                    "paper_role": classify_paper_role({"title": item["title"], "abstract": abstract, "snippet": snippet, "venue": venue}),
                    "provenance": "seed",
                }
            )
    return results


def search_openalex(query: str, limit: int = 4) -> List[Dict[str, str]]:
    params = {"search": query, "per-page": limit, "mailto": os.getenv("RESEARCH_CONTACT_EMAIL", "")}
    url = "https://api.openalex.org/works?" + urllib.parse.urlencode(params)
    payload = _read_json(url, headers={"User-Agent": "ResearchArchitect/1.0"})

    results = []
    for item in payload.get("results", []):
        authorships = item.get("authorships", [])
        authors = [
            authorship.get("author", {}).get("display_name", "")
            for authorship in authorships
            if authorship.get("author", {}).get("display_name")
        ]
        primary_location = item.get("primary_location") or {}
        source = (primary_location.get("source") or {}).get("display_name", "Unknown source")
        landing_url = (
            primary_location.get("landing_page_url")
            or primary_location.get("pdf_url")
            or (f"https://doi.org/{item.get('doi')}" if item.get("doi") else "")
            or item.get("id", "")
        )
        year = item.get("publication_year") or "n.d."
        abstract = _clean_text(_abstract_from_inverted_index(item.get("abstract_inverted_index", {})))
        cited_by_count = item.get("cited_by_count", 0)
        snippet = _clean_text(
            f"OpenAlex | {year} | {source} | Cited by: {cited_by_count} | "
            f"{_format_authors(authors)} | {abstract}",
            max_len=360,
        )
        if item.get("display_name") and landing_url:
            results.append(
                {
                    "title": item["display_name"],
                    "url": landing_url,
                    "snippet": snippet,
                    "provider": "OpenAlex",
                    "authors": _format_authors(authors),
                    "year": str(year),
                    "venue": source,
                    "abstract": abstract,
                    "doi": item.get("doi", ""),
                    "citation_count": cited_by_count,
                    "pdf_url": primary_location.get("pdf_url", "") or "",
                    "source_type": "paper",
                    "openalex_id": item.get("id", ""),
                    "paper_role": classify_paper_role({"title": item["display_name"], "abstract": abstract, "snippet": snippet, "venue": source}),
                    "provenance": "seed",
                }
            )
    return results


def search_crossref(query: str, limit: int = 3) -> List[Dict[str, str]]:
    params = {
        "query.bibliographic": query,
        "rows": limit,
        "mailto": os.getenv("RESEARCH_CONTACT_EMAIL", ""),
    }
    url = "https://api.crossref.org/works?" + urllib.parse.urlencode(params)
    payload = _read_json(url, headers={"User-Agent": "ResearchArchitect/1.0"})

    results = []
    for item in payload.get("message", {}).get("items", []):
        title_list = item.get("title") or []
        if not title_list:
            continue
        title = title_list[0]
        authors = []
        for author in item.get("author", []):
            given = author.get("given", "")
            family = author.get("family", "")
            full_name = " ".join(part for part in [given, family] if part).strip()
            if full_name:
                authors.append(full_name)
        published = item.get("issued", {}).get("date-parts", [[None]])
        year = published[0][0] if published and published[0] else "n.d."
        venue_list = item.get("container-title") or []
        venue = venue_list[0] if venue_list else "Unknown venue"
        doi = item.get("DOI")
        landing_url = item.get("URL") or (f"https://doi.org/{doi}" if doi else "")
        abstract = _clean_text(item.get("abstract", ""))
        citation_count = item.get("is-referenced-by-count", 0)
        snippet = _clean_text(
            f"Crossref | {year} | {venue} | Citations: {citation_count} | "
            f"{_format_authors(authors)} | {abstract}",
            max_len=360,
        )
        if landing_url:
            results.append(
                {
                    "title": title,
                    "url": landing_url,
                    "snippet": snippet,
                    "provider": "Crossref",
                    "authors": _format_authors(authors),
                    "year": str(year),
                    "venue": venue,
                    "abstract": abstract,
                    "doi": doi or "",
                    "citation_count": citation_count,
                    "pdf_url": "",
                    "source_type": "paper",
                    "paper_role": classify_paper_role({"title": title, "abstract": abstract, "snippet": snippet, "venue": venue}),
                    "provenance": "seed",
                }
            )
    return results


def search_arxiv(query: str, limit: int = 3) -> List[Dict[str, str]]:
    encoded = urllib.parse.quote(query)
    url = (
        "https://export.arxiv.org/api/query?"
        f"search_query=all:{encoded}&start=0&max_results={limit}&sortBy=relevance&sortOrder=descending"
    )
    feed = _read_text(url, headers={"User-Agent": "ResearchArchitect/1.0"})
    root = ET.fromstring(feed)
    ns = {"atom": "http://www.w3.org/2005/Atom"}

    results = []
    for entry in root.findall("atom:entry", ns):
        title = _clean_text(entry.findtext("atom:title", default="", namespaces=ns), max_len=500)
        summary = _clean_text(entry.findtext("atom:summary", default="", namespaces=ns))
        paper_id = entry.findtext("atom:id", default="", namespaces=ns)
        published = entry.findtext("atom:published", default="", namespaces=ns)
        year = published[:4] if published else "n.d."
        authors = [
            _clean_text(author.findtext("atom:name", default="", namespaces=ns), max_len=80)
            for author in entry.findall("atom:author", ns)
            if author.findtext("atom:name", default="", namespaces=ns)
        ]
        pdf_url = ""
        for link in entry.findall("atom:link", ns):
            href = link.attrib.get("href", "")
            title_attr = link.attrib.get("title", "")
            if title_attr == "pdf" or href.endswith(".pdf"):
                pdf_url = href
                break
        if title and paper_id:
            results.append(
                {
                    "title": title,
                    "url": paper_id,
                    "snippet": _clean_text(
                        f"arXiv | {year} | Preprint | {_format_authors(authors)} | {summary}",
                        max_len=360,
                    ),
                    "provider": "arXiv",
                    "authors": _format_authors(authors),
                    "year": str(year),
                    "venue": "arXiv",
                    "abstract": summary,
                    "doi": "",
                    "citation_count": 0,
                    "pdf_url": pdf_url,
                    "source_type": "preprint",
                    "openalex_id": "",
                    "paper_role": classify_paper_role({"title": title, "abstract": summary, "snippet": summary, "venue": "arXiv"}),
                    "provenance": "seed",
                }
            )
    return results


def dedupe_sources(results: List[Dict[str, str]], limit: int = 8) -> List[Dict[str, str]]:
    deduped: List[Dict[str, str]] = []
    seen = set()
    for item in results:
        key = (item.get("title", "").strip().lower(), item.get("url", "").strip().lower())
        if key in seen or not item.get("title") or not item.get("url"):
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= limit:
            break
    return deduped


def _select_diverse_sources(
    query: str,
    scored: List[tuple[int, Dict[str, str]]],
    limit: int,
    filters: Optional[List[str]] = None,
) -> List[Dict[str, str]]:
    normalized_filters = _normalize_filters(filters)
    selected: List[Dict[str, str]] = []
    seen_keys = set()
    lowered_query = query.lower()

    def add_candidate(candidate: Dict[str, str]) -> None:
        key = (candidate.get("title", "").strip().lower(), candidate.get("url", "").strip().lower())
        if key in seen_keys or not candidate.get("title") or not candidate.get("url"):
            return
        seen_keys.add(key)
        selected.append(candidate)

    quota_roles: List[str] = []
    if "survey" in normalized_filters or any(term in lowered_query for term in ["survey", "review", "systematic review"]):
        quota_roles.append("survey")
    if "benchmark" in normalized_filters or any(term in lowered_query for term in ["benchmark", "benchmarks", "evaluation", "dataset", "datasets"]):
        quota_roles.append("benchmark")
    quota_roles.append("method")

    for role in quota_roles:
        for _, item in scored:
            if (item.get("paper_role") or classify_paper_role(item)) == role:
                add_candidate(item)
                break

    if "seminal" in normalized_filters:
        by_citations = sorted(scored, key=lambda pair: pair[1].get("citation_count", 0) or 0, reverse=True)
        for _, item in by_citations[:2]:
            add_candidate(item)

    if "recent" in normalized_filters:
        by_year = sorted(
            scored,
            key=lambda pair: int(pair[1].get("year")) if str(pair[1].get("year", "")).isdigit() else 0,
            reverse=True,
        )
        for _, item in by_year[:2]:
            add_candidate(item)

    for _, item in scored:
        if len(selected) >= limit:
            break
        add_candidate(item)

    return selected[:limit]


def rank_sources(
    query: str,
    results: List[Dict[str, str]],
    limit: int = 8,
    filters: Optional[List[str]] = None,
) -> List[Dict[str, str]]:
    constraints = extract_year_constraints(query)
    scored = []
    for item in dedupe_sources(results, limit=max(limit * 3, 12)):
        if not _within_year_constraints(item, constraints):
            continue
        if _topic_exclusion_hit(query, item):
            continue
        if item.get("provenance", "seed") == "seed" and not _is_seed_candidate_relevant(query, item):
            continue
        if item.get("provenance") == "related" and not _is_related_candidate_relevant(query, item):
            continue
        score = _score_source(query, item, filters=filters)
        if score >= 2:
            scored.append((score, item))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return _select_diverse_sources(query, scored, limit=limit, filters=filters)


def fetch_openalex_related_works(source: Dict[str, str], limit: int = 4) -> List[Dict[str, str]]:
    openalex_id = source.get("openalex_id") or _openalex_work_id_from_url(source.get("url", ""))
    if not openalex_id:
        return []

    url = f"https://api.openalex.org/works/{openalex_id}"
    payload = _read_json(url, headers={"User-Agent": "ResearchArchitect/1.0"})
    related_ids = payload.get("related_works", [])[:limit]
    related_results: List[Dict[str, str]] = []
    for related_id in related_ids:
        try:
            work = _read_json(related_id, headers={"User-Agent": "ResearchArchitect/1.0"})
            authorships = work.get("authorships", [])
            authors = [
                authorship.get("author", {}).get("display_name", "")
                for authorship in authorships
                if authorship.get("author", {}).get("display_name")
            ]
            primary_location = work.get("primary_location") or {}
            venue = (primary_location.get("source") or {}).get("display_name", "Unknown source")
            landing_url = (
                primary_location.get("landing_page_url")
                or primary_location.get("pdf_url")
                or (f"https://doi.org/{work.get('doi')}" if work.get("doi") else "")
                or work.get("id", "")
            )
            abstract = _clean_text(_abstract_from_inverted_index(work.get("abstract_inverted_index", {})))
            citation_count = work.get("cited_by_count", 0)
            if work.get("display_name") and landing_url:
                related_results.append(
                    {
                        "title": work["display_name"],
                        "url": landing_url,
                        "snippet": _clean_text(
                            f"OpenAlex related work | {work.get('publication_year', 'n.d.')} | {venue} | "
                            f"Cited by: {citation_count} | {_format_authors(authors)} | {abstract}",
                            max_len=360,
                        ),
                        "provider": "OpenAlex",
                        "authors": _format_authors(authors),
                        "year": str(work.get("publication_year") or "n.d."),
                        "venue": venue,
                        "abstract": abstract,
                        "doi": work.get("doi", ""),
                        "citation_count": citation_count,
                        "pdf_url": primary_location.get("pdf_url", "") or "",
                        "source_type": "paper",
                        "openalex_id": work.get("id", ""),
                        "paper_role": classify_paper_role({"title": work["display_name"], "abstract": abstract, "snippet": abstract, "venue": venue}),
                        "provenance": "related",
                    }
                )
        except Exception:
            continue
    return related_results


def format_reading_path(sources: List[Dict[str, str]]) -> str:
    if not sources:
        return ""

    sorted_by_citations = sorted(sources, key=lambda item: item.get("citation_count", 0) or 0, reverse=True)
    sorted_by_year = sorted(
        sources,
        key=lambda item: (int(item.get("year")) if str(item.get("year", "")).isdigit() else 0),
        reverse=True,
    )
    surveys = [source for source in sources if source.get("paper_role") == "survey"]
    benchmarks = [source for source in sources if source.get("paper_role") == "benchmark"]
    methods = [source for source in sources if source.get("paper_role") == "method"]

    lines = ["Reading Path:"]
    if sorted_by_citations:
        seminal = sorted_by_citations[0]
        lines.append(
            f"- Seminal anchor: {seminal.get('title', 'Unknown')} ({seminal.get('year', 'n.d.')})"
        )
    for source in surveys[:1]:
        lines.append(
            f"- Survey first: {source.get('title', 'Unknown')} ({source.get('year', 'n.d.')})"
        )
    for source in benchmarks[:1]:
        lines.append(
            f"- Benchmark next: {source.get('title', 'Unknown')} ({source.get('year', 'n.d.')})"
        )
    for source in methods[:1]:
        lines.append(
            f"- Method focus: {source.get('title', 'Unknown')} ({source.get('year', 'n.d.')})"
        )
    for source in sorted_by_year[:2]:
        lines.append(
            f"- Current frontier: {source.get('title', 'Unknown')} ({source.get('year', 'n.d.')})"
        )
    return "\n".join(lines)


def format_sources_for_context(results: List[Dict[str, str]]) -> str:
    chunks = []
    for item in results:
        chunks.append(
            "\n".join(
                [
                    f"Provider: {item.get('provider', 'Unknown')}",
                    f"Provenance: {item.get('provenance', 'seed')}",
                    f"Role: {item.get('paper_role', 'method')}",
                    f"Title: {item.get('title', 'Unknown')}",
                    f"Authors: {item.get('authors', 'Unknown authors')}",
                    f"Year: {item.get('year', 'n.d.')}",
                    f"Venue: {item.get('venue', 'Unknown venue')}",
                    f"Citations: {item.get('citation_count', 0)}",
                    f"Abstract/Snippet: {item.get('abstract') or item.get('snippet', '')}",
                    f"URL: {item.get('url', '')}",
                ]
            )
        )
    return "\n\n".join(chunks)
