from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env"
DEFAULT_DATASET_PATH = BACKEND_DIR / "data" / "sample_dataset.json"


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8")

    secret_key: str
    api_prefix: str = "/api"
    cors_allowed_origins: list[str] = ["http://localhost:5173"]
    dataset_path: Path = DEFAULT_DATASET_PATH


config = Config()
