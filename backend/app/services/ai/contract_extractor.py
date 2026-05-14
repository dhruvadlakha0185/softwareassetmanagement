"""
Extract contract metadata from PDF/DOCX bytes using OpenAI gpt-4o (JSON mode).
Returns a dict matching ExtractedContract schema.
"""
import io
import json
from app.core.config import settings

SYSTEM_PROMPT = """You are a software license contract analyst for Dr. Reddy's Laboratories.
Extract the following fields from the contract text and return ONLY valid JSON.
If a field is not found, use null.
Dates must be in YYYY-MM-DD format.
license_type must be "subscription" or "perpetual" or null.
auto_renewal_clause must be "yes", "no", or "opt_in" or null."""

SCHEMA = """{
  "vendor_name": "string or null",
  "po_number": "string or null",
  "clm_id": "string or null",
  "start_date": "YYYY-MM-DD or null",
  "end_date": "YYYY-MM-DD or null",
  "auto_renewal_clause": "yes|no|opt_in or null",
  "total_value_inr": "integer or null",
  "reseller": "string or null",
  "line_items": [
    {
      "contract_name": "string",
      "metric": "string or null",
      "license_type": "subscription|perpetual or null",
      "entitled_count": "integer or null",
      "unit_cost_inr": "integer or null",
      "annual_cost_inr": "integer or null"
    }
  ]
}"""


def _extract_text_from_pdf(data: bytes) -> str:
    import PyPDF2
    reader = PyPDF2.PdfReader(io.BytesIO(data))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages)[:12000]


def _extract_text_from_docx(data: bytes) -> str:
    import docx
    doc = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs)[:12000]


def extract_contract_text(filename: str, data: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return _extract_text_from_pdf(data)
    if lower.endswith(".docx") or lower.endswith(".doc"):
        return _extract_text_from_docx(data)
    raise ValueError(f"Unsupported file type: {filename}. Upload PDF or DOCX.")


async def call_openai(text: str) -> dict:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": f"{SYSTEM_PROMPT}\n\nReturn JSON matching this schema:\n{SCHEMA}"},
            {"role": "user", "content": f"Contract text:\n\n{text}"},
        ],
        temperature=0,
    )
    raw = response.choices[0].message.content
    return json.loads(raw)
