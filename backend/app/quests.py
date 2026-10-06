"""Optional local llama.cpp enrichment. Fixed objectives remain verifiable."""
import os
import httpx

def enrich(template):
    url = os.environ.get("NATUREDEX_LLM_URL")
    if not url:
        return {**template, "generator": "field-guide"}
    try:
        response = httpx.post(url, timeout=20, json={
            "messages": [{"role": "system", "content": "Return JSON with only title and subtitle for a gentle outdoor nature expedition. Do not encourage touching, collecting, feeding, or disturbing wildlife. Title at most 6 words; subtitle at most 16 words. Preserve the supplied objectives."},
                         {"role": "user", "content": str(template["goals"])}],
            "response_format": {"type": "json_object"}, "temperature": .7, "max_tokens": 120,
        })
        response.raise_for_status()
        import json
        data = json.loads(response.json()["choices"][0]["message"]["content"])
        title, subtitle = data.get("title"), data.get("subtitle")
        if not isinstance(title, str) or not isinstance(subtitle, str) or not 0 < len(title) <= 70 or not 0 < len(subtitle) <= 150:
            raise ValueError("Invalid expedition text")
        return {**template, "title": title, "subtitle": subtitle, "generator": "local-llm"}
    except (httpx.HTTPError, KeyError, ValueError, TypeError):
        return {**template, "generator": "field-guide"}
