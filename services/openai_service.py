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

        # Initialize OpenAI client with minimal parameters
        self.client = OpenAI(
            api_key=api_key,
            # No proxies or other potentially unsupported parameters
        )

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
            logger.info(f"Requesting completion for prompt: {prompt[:100]}...")
            logger.info(f"Total prompt length: {len(prompt)} characters")

            # Log the important parts of the prompt
            prompt_parts = prompt.split("\n\n")
            logger.info(f"Prompt has {len(prompt_parts)} sections")

            # Check if template sections are included
            if "Your analysis should include all of the following:" in prompt:
                logger.info("Template sections found in prompt")
                section_index = prompt.find(
                    "Your analysis should include all of the following:"
                )
                section_content = prompt[section_index : section_index + 500]
                logger.info(f"Template sections: {section_content}...")
            else:
                logger.info("WARNING: Template sections not found in prompt")

            response = self.client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a helpful assistant specializing in"
                            " competitor analysis and strategic business consulting."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                max_tokens=4000,  # Maximum allowed tokens for GPT-4 Turbo
            )
            logger.info("Successfully received completion")
            logger.info(
                f"Response length: {len(response.choices[0].message.content)} characters"
            )
            logger.info(
                f"Response preview: {response.choices[0].message.content[:200]}..."
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Error generating completion: {str(e)}")
            raise
