import os
import uuid
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from fastapi import HTTPException
from google.cloud import storage
import tempfile

# Configure logging
logger = logging.getLogger(__name__)


class StorageService:
    """
    Service to handle cloud storage operations using Google Cloud Storage
    """

    def __init__(self):
        self.bucket_name = os.getenv("GCS_BUCKET_NAME")
        # Allow local development mode without GCS
        self.local_mode = os.getenv("STORAGE_MODE", "cloud").lower() == "local"
        self.local_storage_path = os.getenv("LOCAL_STORAGE_PATH", "storage")
        self.client = None

        # Local storage directory
        if self.local_mode:
            os.makedirs(self.local_storage_path, exist_ok=True)
            logger.info(f"Running in local storage mode: {self.local_storage_path}")
        else:
            try:
                # Check for service account key file
                key_path = os.getenv("GCS_KEY_FILE", "service-account-key.json")
                if os.path.exists(key_path):
                    self.client = storage.Client.from_service_account_json(key_path)
                    logger.info(
                        f"Storage service initialized with service account key, "
                        f"using bucket: {self.bucket_name}"
                    )
                else:
                    # Fall back to application default credentials
                    self.client = storage.Client()
                    logger.info(
                        f"Storage service with application default credentials, "
                        f"using bucket: {self.bucket_name}"
                    )
            except Exception as e:
                logger.error(
                    f"Error initializing Google Cloud Storage client: {str(e)}"
                )
                raise

    def get_upload_url(
        self, file_name: str, content_type: str, file_size: int
    ) -> Dict[str, Any]:
        """
        Generate a signed URL for direct upload to storage
        """
        file_id = str(uuid.uuid4())

        # In local mode, we don't need a signed URL
        if self.local_mode:
            # Create a local path for the file
            local_path = os.path.join(self.local_storage_path, file_id)
            expires = datetime.now() + timedelta(minutes=15)

            return {
                "uploadUrl": f"file://{local_path}",
                "fileId": file_id,
                "expiresAt": int(expires.timestamp() * 1000),
            }

        # In cloud mode, generate a signed URL
        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(file_id)

            # Set metadata for the upload
            blob.metadata = {
                "original_filename": file_name,
                "content_type": content_type,
                "file_size": str(file_size),
                "upload_time": datetime.now().isoformat(),
            }

            # Generate a signed URL that expires in 15 minutes
            url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(minutes=15),
                method="PUT",
                content_type=content_type,
            )

            expires = datetime.now() + timedelta(minutes=15)

            return {
                "uploadUrl": url,
                "fileId": file_id,
                "expiresAt": int(expires.timestamp() * 1000),
            }
        except Exception as e:
            logger.error(f"Error generating signed URL: {str(e)}")
            raise

    def complete_upload(
        self, file_id: str, storage_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Verify an upload was completed and return the file details
        """
        if self.local_mode:
            # In local mode, just check if the file exists
            local_path = storage_path or os.path.join(self.local_storage_path, file_id)
            if not os.path.exists(local_path):
                raise HTTPException(
                    status_code=404, detail=f"File not found: {file_id}"
                )

            # Get file details from the local file
            size = os.path.getsize(local_path)
            name = os.path.basename(local_path)

            return {
                "id": file_id,
                "name": name,
                "contentType": "application/octet-stream",
                "size": size,
                "localPath": local_path,
            }

        # In cloud mode, check the blob in GCS
        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(file_id)

            if not blob.exists():
                raise HTTPException(
                    status_code=404, detail=f"File not found in storage: {file_id}"
                )

            # Get metadata
            blob.reload()
            metadata = blob.metadata or {}

            return {
                "id": file_id,
                "name": metadata.get("original_filename", file_id),
                "contentType": metadata.get("content_type", "application/octet-stream"),
                "size": int(metadata.get("file_size", 0)),
                "uploadTime": metadata.get("upload_time"),
            }
        except Exception as e:
            logger.error(f"Error completing upload: {str(e)}")
            raise

    def download_file(self, file_id: str, storage_path: Optional[str] = None) -> bytes:
        """
        Download a file from storage
        """
        if self.local_mode:
            # In local mode, read the file directly
            local_path = storage_path or os.path.join(self.local_storage_path, file_id)
            if not os.path.exists(local_path):
                raise HTTPException(
                    status_code=404, detail=f"File not found: {file_id}"
                )

            with open(local_path, "rb") as f:
                return f.read()

        # In cloud mode, download from GCS
        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(file_id)

            if not blob.exists():
                raise HTTPException(
                    status_code=404, detail=f"File not found in storage: {file_id}"
                )

            # Download to a temporary file
            with tempfile.NamedTemporaryFile() as temp:
                blob.download_to_filename(temp.name)
                with open(temp.name, "rb") as f:
                    return f.read()
        except Exception as e:
            logger.error(f"Error downloading file: {str(e)}")
            raise


# Singleton instance
storage_service = StorageService()
