"""
GPT-4o procurement notes generator.
Takes a context dict for one software entitlement, returns a 3-5 sentence
procurement rationale string, or None on failure.
Never raises — failures are swallowed so publish is never blocked.
"""
from app.core.config import settings

SYSTEM_PROMPT = (
    "You are a Software Asset Management analyst at Dr. Reddy's Laboratories (DRL), "
    "a global pharmaceutical company.\n\n"
    "Your task is to write a procurement rationale note for a software entitlement record. "
    "This note will be read by the CIO and procurement reviewers.\n\n"
    "Write exactly 3-5 sentences of flowing prose. No bullet points, no headers, no markdown.\n\n"
    "Draw on your training knowledge about what this software does and its typical enterprise use cases. "
    "Anchor all claims about scope, cost, and organisational coverage to the fields provided — "
    "do not invent figures or organisational details not present in the input.\n\n"
    "Tone: professional, concise, factual."
)


def _build_user_message(ctx: dict) -> str:
    annual_cost = ctx.get("annual_cost")
    currency = ctx.get("currency", "INR")
    cost_str = f"{annual_cost:,} {currency}" if annual_cost is not None else "not specified"

    entitled = ctx.get("entitled_count")
    bus = ", ".join(ctx.get("business_units") or []) or "not specified"
    regions = ", ".join(ctx.get("regions") or []) or "not specified"

    return (
        f"Software: {ctx.get('primary_sw_name', '')}\n"
        f"Publisher: {ctx.get('publisher') or 'not specified'}\n"
        f"Contract name: {ctx.get('contract_name', '')}\n"
        f"Category: {ctx.get('category_name') or 'not specified'} > {ctx.get('sub_category_name') or 'not specified'}\n"
        f"License type: {ctx.get('license_type_name') or 'not specified'}\n"
        f"Deployment: {ctx.get('deployment') or 'not specified'}\n"
        f"GxP regulated: {ctx.get('gxp_flag') or 'no'}\n"
        f"Entitled: {entitled if entitled is not None else 'not specified'} {ctx.get('metric_name') or 'licenses'}\n"
        f"Business units: {bus}\n"
        f"Regions: {regions}\n"
        f"Vendor: {ctx.get('vendor_name') or 'not specified'}\n"
        f"Contract period: {ctx.get('start_date') or 'not specified'} to {ctx.get('end_date') or 'not specified'}\n"
        f"Annual cost: {cost_str}\n"
        f"Auto-renewal: {ctx.get('auto_renewal_clause') or 'not specified'}\n\n"
        "Write the procurement rationale note."
    )


async def generate_entitlement_notes(context: dict) -> str | None:
    if settings.openai_api_key == "dummy":
        return None
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_message(context)},
            ],
            max_tokens=250,
            temperature=0.4,
            timeout=10,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return None
