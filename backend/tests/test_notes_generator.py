import pytest
from unittest.mock import AsyncMock, MagicMock, patch


SAMPLE_CONTEXT = {
    "primary_sw_name": "Microsoft 365 E3",
    "publisher": "Microsoft Corporation",
    "contract_name": "Microsoft 365 E3 — Enterprise Agreement",
    "category_name": "Productivity",
    "sub_category_name": "Collaboration",
    "license_type_name": "Subscription",
    "deployment": "cloud",
    "gxp_flag": "no",
    "entitled_count": 500,
    "metric_name": "Named Users",
    "business_units": ["Finance", "R&D"],
    "regions": ["India", "US"],
    "vendor_name": "Microsoft Ireland Operations Ltd.",
    "start_date": "2026-04-01",
    "end_date": "2027-03-31",
    "annual_cost": 12000000,
    "currency": "INR",
    "auto_renewal_clause": "yes",
}


@pytest.mark.asyncio
async def test_returns_none_when_key_is_dummy():
    """No OpenAI call when key is the dev placeholder."""
    from app.services.ai.notes_generator import generate_entitlement_notes
    with patch("app.services.ai.notes_generator.settings") as mock_settings:
        mock_settings.openai_api_key = "dummy"
        result = await generate_entitlement_notes(SAMPLE_CONTEXT)
    assert result is None


@pytest.mark.asyncio
async def test_returns_generated_string_on_success():
    """Returns the LLM content string when OpenAI call succeeds."""
    from app.services.ai.notes_generator import generate_entitlement_notes

    mock_message = MagicMock()
    mock_message.content = "  Microsoft 365 E3 is an enterprise productivity suite.  "
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("app.services.ai.notes_generator.settings") as mock_settings, \
         patch("app.services.ai.notes_generator.AsyncOpenAI", return_value=mock_client):
        mock_settings.openai_api_key = "sk-test-key"
        result = await generate_entitlement_notes(SAMPLE_CONTEXT)

    assert result == "Microsoft 365 E3 is an enterprise productivity suite."


@pytest.mark.asyncio
async def test_returns_none_on_openai_exception():
    """Swallows exceptions and returns None so publish is never blocked."""
    from app.services.ai.notes_generator import generate_entitlement_notes

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=Exception("API error"))

    with patch("app.services.ai.notes_generator.settings") as mock_settings, \
         patch("app.services.ai.notes_generator.AsyncOpenAI", return_value=mock_client):
        mock_settings.openai_api_key = "sk-test-key"
        result = await generate_entitlement_notes(SAMPLE_CONTEXT)

    assert result is None


@pytest.mark.asyncio
async def test_build_user_message_formats_cost():
    """_build_user_message formats annual_cost with commas."""
    from app.services.ai.notes_generator import _build_user_message
    msg = _build_user_message(SAMPLE_CONTEXT)
    assert "12,000,000 INR" in msg


@pytest.mark.asyncio
async def test_build_user_message_handles_missing_fields():
    """_build_user_message handles None/missing fields gracefully."""
    from app.services.ai.notes_generator import _build_user_message
    msg = _build_user_message({
        "primary_sw_name": "SAP S/4HANA",
        "contract_name": "SAP ERP License",
    })
    assert "SAP S/4HANA" in msg
    assert "not specified" in msg
