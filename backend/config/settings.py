import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env"
DEFAULT_DATASET_PATH = BACKEND_DIR / "chart" / "data" / "sample_dataset.json"

load_dotenv(ENV_FILE)


class BaseConfig:
    SECRET_KEY = os.environ["SECRET_KEY"]
    DEBUG = os.environ.get("DEBUG", "False").strip().lower() == "true"
    ALLOWED_HOSTS = [
        host.strip() for host in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    ]
    API_PREFIX = os.environ.get("API_PREFIX", "/api")
    CORS_ALLOWED_ORIGINS = [
        origin.strip()
        for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    ]
    DATASET_PATH = (
        Path(os.environ["DATASET_PATH"]) if "DATASET_PATH" in os.environ else DEFAULT_DATASET_PATH
    )
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")


config = BaseConfig()
