import httpx
from app.services.storage.base import StorageBackend
from app.core.config import settings

BUCKET = "drl-sam-files"


class SupabaseStorageBackend(StorageBackend):
    def __init__(self):
        self._base = f"{settings.supabase_url}/storage/v1"
        self._headers = {
            "Authorization": f"Bearer {settings.supabase_service_key}",
            "apikey": settings.supabase_service_key,
        }

    async def upload(self, data: bytes, path: str, content_type: str = "application/octet-stream") -> str:
        url = f"{self._base}/object/{BUCKET}/{path}"
        async with httpx.AsyncClient() as client:
            r = await client.post(
                url,
                content=data,
                headers={**self._headers, "Content-Type": content_type, "x-upsert": "true"},
            )
            r.raise_for_status()
        return path

    async def get_signed_url(self, path: str, expires_in: int = 3600) -> str:
        url = f"{self._base}/object/sign/{BUCKET}/{path}"
        async with httpx.AsyncClient() as client:
            r = await client.post(
                url,
                json={"expiresIn": expires_in},
                headers={**self._headers, "Content-Type": "application/json"},
            )
            r.raise_for_status()
        return r.json()["signedURL"]
