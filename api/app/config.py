"""Settings loaded from env (api/.env, then repo-root .env.local written by `neon env pull`)."""
import os
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

API_DIR = Path(__file__).resolve().parents[1]
load_dotenv(API_DIR / ".env")
load_dotenv(API_DIR.parent / ".env.local")

# The API is a long-running server and LangGraph's saver/store need session features,
# so it uses the direct (unpooled) connection string.
DATABASE_URL = os.getenv("DATABASE_URL_UNPOOLED") or os.getenv("DATABASE_URL", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SERVICE_TOKEN = os.getenv("SERVICE_TOKEN", "")
MODEL = "claude-haiku-5-5"  # fixed by the hackathon rules
EFFORT = os.getenv("MODEL_EFFORT", "low")
MAX_TOKENS = int(os.getenv("MODEL_MAX_TOKENS", "1024"))
SPEND_CAP_USD = float(os.getenv("SPEND_CAP_USD", "1.60"))
DEALER_TZ_NAME = os.getenv("DEALER_TZ", "Asia/Karachi")
DEALER_TZ = ZoneInfo(DEALER_TZ_NAME)
GIT_SHA = os.getenv("GIT_SHA", "dev")[:12]
CANARY = "DC-7Q2-AVA"

# Haiku 5.5 pricing (prompt <= 100K tokens): $ per token
PRICE_IN = 0.10 / 1_000_000
PRICE_OUT = 0.50 / 1_000_000
PRICE_CACHE_READ = 0.01 / 1_000_000

MAX_MESSAGE_CHARS = 2000
HISTORY_WINDOW = 24
TURN_TIMEOUT_S = float(os.getenv("TURN_TIMEOUT_S", "45"))
RATE_PER_USER_MIN = int(os.getenv("RATE_PER_USER_MIN", "30"))
RATE_GLOBAL_MIN = int(os.getenv("RATE_GLOBAL_MIN", "120"))

DEALER_NAME = "Apex Motors"
DEALER_ADDRESS = "42 Demo Avenue, Gulberg, Lahore"
OPEN_HOUR, LAST_SLOT_HOUR = 10, 17
BOOKING_WINDOW_DAYS = 14
MAX_UPCOMING_BOOKINGS = 3
DEFAULT_APR = 7.9
