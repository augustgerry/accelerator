"""
Google Drive integration. Files stay in Drive — only extracted text +
embeddings are stored locally. See README for OAuth setup.
"""

from app.config import settings


def list_drive_files(folder_id: str | None = None) -> list[dict]:
    """
    TODO: implement with google-api-python-client:
      - authenticate via GOOGLE_OAUTH_CREDENTIALS_PATH
      - list files in `folder_id or settings.google_drive_folder_id`
      - return [{id, name, mimeType, modifiedTime}, ...]
    """
    raise NotImplementedError


def fetch_and_extract_text(file_id: str) -> str:
    """
    TODO: download file content by id, then extract text:
      - PDF -> pypdf
      - DOCX -> python-docx
      - Google Docs (native) -> export as text/plain via Drive API
    """
    raise NotImplementedError
