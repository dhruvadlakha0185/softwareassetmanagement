from app.core.security import get_password_hash, verify_password, create_access_token, decode_token


def test_password_hash_and_verify():
    hashed = get_password_hash("Admin123!")
    assert verify_password("Admin123!", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_create_and_decode_access_token():
    token = create_access_token({"sub": "test@drl.local", "role": "COE_ADMIN"})
    payload = decode_token(token)
    assert payload["sub"] == "test@drl.local"
    assert payload["role"] == "COE_ADMIN"
    assert payload["type"] == "access"


def test_decode_invalid_token_returns_none():
    result = decode_token("not.a.valid.token")
    assert result is None


def test_decode_tampered_token_returns_none():
    token = create_access_token({"sub": "test@drl.local"})
    tampered = token[:-4] + "XXXX"
    assert decode_token(tampered) is None
