import os
from dotenv import load_dotenv
from groq import AsyncGroq

# Load environment variables from .env file
load_dotenv()

# Load GROQ_API_KEY and GROQ_MODEL from environment variables
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b")

# Initialize a single Groq client instance
client = AsyncGroq(api_key=GROQ_API_KEY)
