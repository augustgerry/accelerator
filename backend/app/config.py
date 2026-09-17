from pathlib import Path
from pydantic_settings import BaseSettings

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    llm_provider: str = "claude"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"
    google_api_key: str = ""
    gemini_model: str = "gemini-flash-lite-latest"
    openai_api_key: str = ""

    database_url: str = ""

    google_drive_folder_id: str = ""
    google_oauth_credentials_path: str = "./credentials.json"

    default_workspace_id: str = "smg-presales-mvp"

    # Client-side toggle in Settings should mirror this — but the real
    # cost gate lives here, server-side, not just in the UI.
    enable_external_research: bool = False

    class Config:
        env_file = str(_ENV_FILE) if _ENV_FILE.exists() else ".env"


settings = Settings()
