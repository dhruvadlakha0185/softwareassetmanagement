from abc import ABC, abstractmethod


class StorageBackend(ABC):
    @abstractmethod
    async def upload(self, data: bytes, path: str, content_type: str = "application/octet-stream") -> str:
        """Upload bytes to the given path. Returns the storage path."""

    @abstractmethod
    async def get_signed_url(self, path: str, expires_in: int = 3600) -> str:
        """Return a time-limited URL for downloading the file at path."""
