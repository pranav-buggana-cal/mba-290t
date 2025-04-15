import os
import logging
from openai import OpenAI, AsyncOpenAI
from openai.types.create_embedding_response import CreateEmbeddingResponse
from openai.types.chat import ChatCompletion
from dotenv import load_dotenv
from typing import List, Dict
from services.rate_limiter import rate_limiter
import tiktoken

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Define model constants with environment variable overrides
EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
COMPLETION_MODEL = os.getenv("OPENAI_COMPLETION_MODEL", "gpt-4-turbo-preview")
COMPLETION_TEMPERATURE = float(os.getenv("OPENAI_TEMPERATURE", "0.7"))
COMPLETION_MAX_TOKENS = int(os.getenv("OPENAI_MAX_TOKENS", "4000"))

# Initialize tokenizer for counting tokens - with improved version handling
try:
    # Get tiktoken version to handle differences
    import pkg_resources

    tiktoken_version = pkg_resources.get_distribution("tiktoken").version
    logger.info(f"Using tiktoken version {tiktoken_version}")

    if pkg_resources.parse_version(tiktoken_version) >= pkg_resources.parse_version(
        "0.6.0"
    ):
        # For tiktoken 0.6.0+
        GPT4_TOKENIZER = tiktoken.encoding_for_model("gpt-4")
        logger.info("Successfully initialized GPT-4 tokenizer using encoding_for_model")
    else:
        # For tiktoken 0.5.x
        GPT4_TOKENIZER = tiktoken.get_encoding("cl100k_base")  # Base encoding for GPT-4
        logger.info("Using cl100k_base tokenizer for tiktoken 0.5.x")
except (ValueError, ImportError, pkg_resources.DistributionNotFound) as e:
    logger.warning(f"Failed to load GPT-4 tokenizer: {e}. Using cl100k_base fallback.")
    try:
        GPT4_TOKENIZER = tiktoken.get_encoding("cl100k_base")  # Base encoding for GPT-4
        logger.info("Using cl100k_base tokenizer as fallback")
    except Exception as e2:
        logger.error(
            f"Failed to load fallback tokenizer: {e2}. Using simple estimation."
        )
        GPT4_TOKENIZER = None

# API configuration
API_REQUEST_TIMEOUT = int(os.getenv("OPENAI_API_TIMEOUT", "60"))  # 60 seconds default
API_MAX_RETRIES = int(os.getenv("OPENAI_MAX_RETRIES", "5"))  # 5 retries default


class OpenAIService:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        logger.info("API Key loaded: %s...", api_key[:10])

        # Initialize both sync and async OpenAI clients
        self.client = OpenAI(api_key=api_key)
        self.async_client = AsyncOpenAI(
            api_key=api_key,
            timeout=API_REQUEST_TIMEOUT,  # Use configured timeout
            max_retries=API_MAX_RETRIES,  # Use configured retries
        )

        # Track token usage for better rate limiting
        self.token_usage = {"completion": 0, "embedding": 0}

    def count_tokens(self, text: str) -> int:
        """Count the number of tokens in a text string using tiktoken"""
        if GPT4_TOKENIZER is not None:
            return len(GPT4_TOKENIZER.encode(text))
        else:
            # Simple fallback estimation: ~4 characters per token for English text
            return len(text) // 4

    def count_batch_tokens(self, texts: List[str]) -> int:
        """Count the total number of tokens in a batch of texts"""
        return sum(self.count_tokens(text) for text in texts)

    async def get_embedding(self, text: str) -> List[float]:
        """Get embedding for text using OpenAI's embedding model with rate limiting."""
        if not text.strip():
            logger.warning(
                "Empty text provided for embedding, returning empty embedding"
            )
            return []

        # Count tokens for logging and estimation
        token_count = self.count_tokens(text)
        logger.debug(f"Embedding text with {token_count} tokens")

        async def _get_embedding() -> List[float]:
            response = await self.async_client.embeddings.create(
                model=EMBEDDING_MODEL, input=text
            )
            # Track usage for our internal metrics
            if hasattr(response, "usage") and response.usage:
                self.token_usage["embedding"] += response.usage.total_tokens
                logger.debug(f"Used {response.usage.total_tokens} tokens for embedding")
            return response.data[0].embedding

        # Use the rate limiter to handle API limits with retries
        try:
            embedding = await rate_limiter.with_rate_limit(_get_embedding)
            return embedding
        except Exception as e:
            logger.error(f"Error getting embedding: {str(e)}")
            raise

    async def get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Get embeddings for multiple texts in a single API call with rate limiting."""
        if not texts:
            return []

        # Filter out empty strings to avoid API errors
        valid_texts = [text for text in texts if text.strip()]
        if not valid_texts:
            logger.warning("No valid texts provided for batch embedding")
            return [[] for _ in texts]  # Return empty embeddings to maintain batch size

        # Estimate token usage for the batch
        estimated_tokens = self.count_batch_tokens(valid_texts)
        logger.info(f"Estimated token usage for batch: {estimated_tokens} tokens")

        # Process in batches that fit within token limits
        # OpenAI's embeddings API has a token limit of ~8k tokens per request
        MAX_TOKENS_PER_BATCH = 8000
        BATCH_SIZE = 100  # Maximum number of items per batch

        all_embeddings = []
        batch_indices = []
        current_batch = []
        current_batch_tokens = 0

        # Create batches that respect both count and token limits
        for i, text in enumerate(texts):
            if not text.strip():
                # Add placeholder for empty text
                all_embeddings.append([])
                continue

            text_tokens = self.count_tokens(text)

            # If adding this text would exceed batch limits, process the current batch
            if (
                len(current_batch) >= BATCH_SIZE
                or current_batch_tokens + text_tokens > MAX_TOKENS_PER_BATCH
            ):
                if current_batch:  # Only if we have items to process
                    batch_indices.append(
                        (len(all_embeddings), len(all_embeddings) + len(current_batch))
                    )
                    all_embeddings.extend([None] * len(current_batch))  # Placeholders
                    current_batch = []
                    current_batch_tokens = 0

            # Add text to current batch
            current_batch.append(text)
            current_batch_tokens += text_tokens

        # Add the last batch if not empty
        if current_batch:
            batch_indices.append(
                (len(all_embeddings), len(all_embeddings) + len(current_batch))
            )
            all_embeddings.extend([None] * len(current_batch))

        # Process each batch with rate limiting
        for start_idx, end_idx in batch_indices:
            batch = texts[start_idx:end_idx]
            logger.info(
                f"Processing embedding batch {start_idx}-{end_idx} "
                f"with {len(batch)} texts"
            )

            async def _get_batch_embedding() -> CreateEmbeddingResponse:
                return await self.async_client.embeddings.create(
                    model=EMBEDDING_MODEL, input=batch
                )

            try:
                response = await rate_limiter.with_rate_limit(_get_batch_embedding)

                # Track token usage
                if hasattr(response, "usage") and response.usage:
                    self.token_usage["embedding"] += response.usage.total_tokens
                    logger.info(
                        f"Used {response.usage.total_tokens} tokens for batch embedding"
                    )

                # Extract embeddings in the same order
                batch_embeddings = [data.embedding for data in response.data]

                # Fill in the placeholders
                for i, embedding in enumerate(batch_embeddings):
                    all_embeddings[start_idx + i] = embedding

                logger.info(
                    f"Successfully received {len(batch_embeddings)} "
                    f"embeddings for batch"
                )

            except Exception as e:
                logger.error(
                    f"Error in batch embedding (indices {start_idx}-{end_idx}): "
                    f"{str(e)}"
                )
                # Fill missing embeddings with empty lists
                for i in range(start_idx, end_idx):
                    if all_embeddings[i] is None:
                        all_embeddings[i] = []
                # Re-raise the exception after filling placeholders
                raise

        # Ensure we have the right number of embeddings
        assert len(all_embeddings) == len(
            texts
        ), "Mismatch between input texts and output embeddings"

        # Replace any None values with empty lists (shouldn't happen, but just in case)
        all_embeddings = [emb if emb is not None else [] for emb in all_embeddings]

        return all_embeddings

    async def generate_completion(self, prompt: str) -> str:
        """Generate completion using OpenAI's chat model with rate limiting."""
        try:
            # Count tokens for better rate limiting
            prompt_tokens = self.count_tokens(prompt)
            logger.info(f"Generating completion for prompt with {prompt_tokens} tokens")

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

            async def _generate_completion() -> ChatCompletion:
                return await self.async_client.chat.completions.create(
                    model=COMPLETION_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": "You are a strategic business analyst.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=COMPLETION_TEMPERATURE,
                    max_tokens=COMPLETION_MAX_TOKENS,
                )

            # Use the rate limiter to handle API limits with retries
            response = await rate_limiter.with_rate_limit(_generate_completion)

            # Track token usage
            if hasattr(response, "usage") and response.usage:
                self.token_usage["completion"] += response.usage.total_tokens
                logger.info(f"Used {response.usage.total_tokens} tokens for completion")
                logger.info(
                    f"Completion breakdown - Input: {response.usage.prompt_tokens}, "
                    f"Output: {response.usage.completion_tokens}"
                )

            result = response.choices[0].message.content
            logger.info(f"Successfully received completion: {len(result)} chars")
            return result

        except Exception as e:
            logger.error(f"Error generating completion: {str(e)}")
            raise

    def get_token_usage(self) -> Dict[str, int]:
        """Get the current token usage statistics"""
        return self.token_usage.copy()
