from app.core.config import settings
from app.services.storage.base import StorageBackend

_instance: StorageBackend | None = None


def get_storage_backend() -> StorageBackend:
    global _instance
    if _instance is None:
        if settings.storage_backend == "s3":
            from app.services.storage.s3_backend import S3StorageBackend
            _instance = S3StorageBackend()
        else:
            from app.services.storage.supabase_backend import SupabaseStorageBackend
            _instance = SupabaseStorageBackend()
    return _instance
