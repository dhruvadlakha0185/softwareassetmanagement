import asyncio
from app.services.storage.base import StorageBackend
from app.core.config import settings


class S3StorageBackend(StorageBackend):
    def __init__(self):
        import boto3
        self._s3 = boto3.client(
            "s3",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        self._bucket = settings.aws_s3_bucket_active

    async def upload(self, data: bytes, path: str, content_type: str = "application/octet-stream") -> str:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._s3.put_object(
                Bucket=self._bucket,
                Key=path,
                Body=data,
                ContentType=content_type,
            ),
        )
        return path

    async def get_signed_url(self, path: str, expires_in: int = 3600) -> str:
        loop = asyncio.get_event_loop()
        url = await loop.run_in_executor(
            None,
            lambda: self._s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": path},
                ExpiresIn=expires_in,
            ),
        )
        return url
