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

            # Debug: Check for template integrity
            required_sections = [
                "Executive Summary",
                "List of Top Competitors",
                "Industry Analysis",
                "Market Positioning",
                "Competitive Analysis",
                "Strategic Recommendations",
                "Risk Assessment",
            ]

            # Log template integrity check
            section_check = []
            for section in required_sections:
                found = section in prompt
                section_check.append(f"{section}: {'FOUND' if found else 'MISSING'}")

            logger.info("Template section check: " + ", ".join(section_check))

            # Print the part of the prompt that should contain section requirements
            directive_marker = "Your analysis should include all of the following"
            if directive_marker in prompt:
                start_idx = prompt.find(directive_marker)
                end_idx = prompt.find("Ensure your analysis is thorough", start_idx)
                if end_idx == -1:  # If not found, just take the next 500 chars
                    end_idx = min(start_idx + 500, len(prompt))

                sections_text = prompt[start_idx:end_idx]
                logger.info(f"SECTIONS TEXT: {sections_text}")
            else:
                logger.warning("Directive marker not found in prompt!")

            response = self.client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a helpful assistant specializing in"
                            " competitor analysis and strategic business consulting."
                            " Always include all the requested sections in your analysis."
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
