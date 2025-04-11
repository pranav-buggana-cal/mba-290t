import os
import logging
from openai import OpenAI
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()


class OpenAIService:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        logger.info("API Key loaded: %s...", api_key[:10])
        self.client = OpenAI(api_key=api_key)

    def get_embedding(self, text: str) -> list:
        """Get embedding for text using OpenAI's embedding model."""
        try:
            logger.info("Requesting embedding for text: %s...", text[:100])
            response = self.client.embeddings.create(
                model="text-embedding-3-small", input=text
            )
            logger.info("Successfully received embedding")
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Error getting embedding: {str(e)}")
            raise

    def generate_completion(self, prompt: str) -> str:
        """Generate completion using OpenAI's chat model."""
        try:
            # Create a new chat for each request to ensure fresh context
            logger.info("Requesting completion for prompt: %s...", prompt[:100])
            response = self.client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a helpful assistant specializing in competitor analysis."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                max_tokens=2000,
            )
            logger.info("Successfully received completion")
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Error generating completion: {str(e)}")
            raise
