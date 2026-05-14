"""
GPT-4o reconciliation advisor.
Takes a list of entitlement contexts, returns {ent_id: recommendation_text}.
Falls back to empty dict if OpenAI is unavailable.
"""
import json
from app.core.config import settings

SYSTEM_PROMPT = """You are a software license optimization advisor for Dr. Reddy's Laboratories.
Given a list of entitlements with utilisation data, return a JSON array of actionable recommendations.
Each item must have "ent_id" and "recommendation" fields.
Keep each recommendation to 1-2 specific, actionable sentences.
Consider: GxP compliance requirements (cannot simply remove GxP software), vendor audit risk,
license type (perpetual vs subscription), and cost impact."""


async def get_recommendations(contexts: list[dict]) -> dict[str, str]:
    """
    contexts: list of dicts with keys:
      ent_id, sw_name, util_pct, status, license_type,
      unit_cost_inr, entitled, in_use, is_gxp
    Returns: {ent_id: recommendation_text}
    If OpenAI unavailable (no key, timeout, etc.) returns {}.
    """
    if not contexts or settings.openai_api_key == "dummy":
        return {}
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        payload = json.dumps(contexts, default=str)
        response = await client.chat.completions.create(
            model="gpt-4o",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Entitlement contexts:\n{payload}\n\nReturn JSON: {{\"recommendations\": [{{\"ent_id\": ..., \"recommendation\": ...}}]}}"},
            ],
            temperature=0,
            timeout=60,
        )
        raw = json.loads(response.choices[0].message.content)
        items = raw.get("recommendations", [])
        return {item["ent_id"]: item["recommendation"] for item in items if "ent_id" in item}
    except Exception:
        return {}
