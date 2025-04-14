import logging
from typing import List, Dict, Tuple
import os
from .openai_service import OpenAIService
from db.vector_db import VectorDB
from PyPDF2 import PdfReader
from docx import Document
import io
import re

logger = logging.getLogger(__name__)


class RAGService:
    def __init__(self):
        self.openai_service = OpenAIService()
        self.vector_db = VectorDB()
        self.chunk_size = 1000
        self.chunk_overlap = 200
        self._load_prompts()

    def _load_prompts(self):
        """Load prompt templates from file."""
        # Get the absolute path to the prompts file
        current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        prompts_path = os.path.join(current_dir, "prompts", "template_prompts.txt")

        try:
            with open(prompts_path, "r") as f:
                content = f.read()
                logger.info(
                    f"Loaded prompt template file with {len(content)} characters"
                )

                self.prompts = {}

                # Split by template headers (# followed by a name)
                # This regex matches # at the start of a line followed by text
                sections = re.split(r"(?=^# .*$)", content, flags=re.MULTILINE)
                # Remove empty sections at the beginning
                sections = [s for s in sections if s.strip()]

                logger.info(f"Found {len(sections)} template sections")

                for section in sections:
                    # Extract the section name from the first line
                    lines = section.strip().split("\n")
                    if not lines:
                        continue

                    first_line = lines[0].strip()
                    if not first_line.startswith("# "):
                        logger.warning(f"Invalid header: {first_line[:30]}...")
                        continue

                    name = first_line[2:].strip()  # Remove '# ' prefix
                    # The template is everything after the first line
                    template = "\n".join(lines[1:]).strip()

                    # Log the template details
                    logger.info(
                        f"Loaded template: {name} with {len(template)} characters"
                    )
                    logger.info(f"Template preview: {template[:200]}...")

                    # For competitor analysis template, verify critical sections exist
                    if name == "Competitor Analysis Template":
                        # Ensure required markers are present
                        required_markers = [
                            "{query}",
                            "Your analysis should include",
                            "Executive Summary",
                            "Industry Analysis",
                        ]

                        for marker in required_markers:
                            if marker not in template:
                                logger.error(
                                    f"Template missing critical marker: {marker}"
                                )
                                # Fix: Reload the template from the original file
                                logger.info("Attempting to fix template...")
                                with open(prompts_path, "r") as fix_file:
                                    fix_content = fix_file.read()
                                    if marker in fix_content:
                                        logger.info(
                                            f"Marker '{marker}' found in original file"
                                        )
                                        # Extract the complete template directly
                                        match = re.search(
                                            r"^# Competitor Analysis Template$(.*?)(?=^# |\Z)",
                                            fix_content,
                                            re.MULTILINE | re.DOTALL,
                                        )
                                        if match:
                                            template = match.group(1).strip()
                                            logger.info(
                                                "Template fixed from original file"
                                            )
                                        else:
                                            logger.error(
                                                "Failed to extract template from original file"
                                            )

                    self.prompts[name] = template

                logger.info(f"Successfully loaded {len(self.prompts)} templates")

        except FileNotFoundError:
            logger.error(f"Could not find prompts file at {prompts_path}")
            raise FileNotFoundError(f"Could not find prompts file at {prompts_path}")
        except Exception as e:
            logger.error(f"Error loading prompts: {str(e)}")
            raise Exception(f"Error loading prompts: {str(e)}")

    def _extract_text_from_file(self, content: bytes, filename: str) -> str:
        """Extract text from different file types."""
        file_extension = os.path.splitext(filename.lower())[1]

        try:
            if file_extension == ".pdf":
                # Handle PDF files
                pdf_file = io.BytesIO(content)
                pdf_reader = PdfReader(pdf_file)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
                return text

            elif file_extension == ".docx":
                # Handle DOCX files
                doc_file = io.BytesIO(content)
                doc = Document(doc_file)
                text = ""
                for paragraph in doc.paragraphs:
                    text += paragraph.text + "\n"
                return text

            elif file_extension == ".txt":
                # Handle plain text files
                return content.decode("utf-8")

            else:
                raise ValueError(f"Unsupported file type: {file_extension}")

        except Exception as e:
            logger.error(f"Error extracting text from {filename}: {str(e)}")
            raise

    async def process_document(
        self, content: bytes, filename: str, file_type: str = None
    ):
        """Process and store a document in the vector database.

        Args:
            content: Raw file content
            filename: Name of the file
            file_type: Type of document ('competitor' or 'business')
        """
        try:
            logger.info(
                f"Processing document: {filename} as {file_type or 'unknown type'}"
            )

            # Extract text based on file type
            text = self._extract_text_from_file(content, filename)
            logger.info(f"Successfully extracted text from {filename}")

            # Remove any null bytes and normalize whitespace
            text = text.replace("\x00", "").strip()
            text = " ".join(text.split())

            if not text:
                raise ValueError(f"No text content extracted from {filename}")

            chunks = self._chunk_text(text)
            logger.info(f"Created {len(chunks)} chunks")

            for i, chunk in enumerate(chunks):
                if chunk.strip():  # Only process non-empty chunks
                    logger.info(f"Processing chunk {i+1}/{len(chunks)}")
                    embedding = self.openai_service.get_embedding(chunk)
                    # Include file_type in metadata
                    metadata = {"source": filename, "doc_type": file_type or "unknown"}
                    await self.vector_db.add_document(
                        text=chunk, embedding=embedding, metadata=metadata
                    )
            logger.info(f"Successfully processed document: {filename}")

        except Exception as e:
            logger.error(f"Error processing document: {str(e)}")
            raise

    async def get_relevant_context(self, query: str) -> Tuple[List[Dict], List[Dict]]:
        """Retrieve relevant context for a query, separated by type.

        Returns:
            Tuple containing (competitor_context, business_context)
        """
        try:
            logger.info(f"Getting embedding for query: {query}")
            query_embedding = self.openai_service.get_embedding(query)
            logger.info("Searching vector database")

            # Get all relevant documents
            results = await self.vector_db.search(query_embedding, limit=10)

            # Separate results by document type
            competitor_docs = []
            business_docs = []

            for doc in results:
                doc_type = doc["metadata"].get("doc_type", "unknown")
                if doc_type == "competitor":
                    competitor_docs.append(doc)
                elif doc_type == "business":
                    business_docs.append(doc)
                else:
                    # For backward compatibility, add to both if type unknown
                    competitor_docs.append(doc)
                    business_docs.append(doc)

            # Limit to top 5 of each type
            competitor_docs = competitor_docs[:5]
            business_docs = business_docs[:5]

            logger.info(
                f"Found {len(competitor_docs)} competitor docs and {len(business_docs)} business docs"
            )
            return (competitor_docs, business_docs)
        except Exception as e:
            logger.error(f"Error getting relevant context: {str(e)}")
            raise

    async def clear_vector_db(self):
        """Clear all documents from the vector database."""
        try:
            logger.info("Clearing vector database...")
            await self.vector_db.clear_collection()
            logger.info("Vector database cleared successfully")
        except Exception as e:
            logger.error(f"Error clearing vector database: {str(e)}")
            raise

    async def generate_analysis(
        self, query: str, context: Tuple[List[Dict], List[Dict]]
    ) -> str:
        """Generate analysis using RAG."""
        try:
            competitor_docs, business_docs = context

            # Join texts separately
            competitor_text = "\n\n".join([doc["text"] for doc in competitor_docs])
            business_text = "\n\n".join([doc["text"] for doc in business_docs])

            total_length = len(competitor_text) + len(business_text)
            logger.info(f"Generating analysis with context length: {total_length}")

            # Get the template directly from the file to avoid any potential truncation
            current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            prompts_path = os.path.join(current_dir, "prompts", "template_prompts.txt")

            try:
                with open(prompts_path, "r") as f:
                    content = f.read()
                    # Extract the competitor analysis template directly from the file
                    match = re.search(
                        r"^# Competitor Analysis Template$(.*?)(?=^# |\Z)",
                        content,
                        re.MULTILINE | re.DOTALL,
                    )
                    if match:
                        fresh_template = match.group(1).strip()
                        logger.info(
                            f"Loaded fresh template with {len(fresh_template)} chars"
                        )
                        template = fresh_template
                    else:
                        # Fall back to the cached template
                        template_key = "Competitor Analysis Template"
                        template = self.prompts[template_key]
                        logger.warning("Using cached template as fallback")
            except Exception as e:
                logger.warning(
                    f"Error loading fresh template: {e}, using cached version"
                )
                template_key = "Competitor Analysis Template"
                template = self.prompts[template_key]

            logger.info(f"Template length: {len(template)} chars")
            logger.info(f"Template preview: {template[:300]}...")
            logger.info(f"Template middle part: {template[300:600]}...")
            logger.info(f"Template end part: {template[-300:]}...")

            # Format the template with the provided values
            try:
                # Final verification of template integrity
                if "Your analysis should include all of the following" in template:
                    start_idx = template.find(
                        "Your analysis should include all of the following"
                    )
                    section_requirements = template[start_idx : start_idx + 800]
                    logger.info(f"Section requirements: {section_requirements}")

                # Format the template
                prompt = template.format(
                    query=query,
                    context=competitor_text,
                )
                logger.info("Template formatting successful")

            except Exception as e:
                logger.error(f"Template formatting failed: {e}")
                # Fall back to basic formatting
                prompt = (
                    f"You are a strategic business analyst. Based on the provided context about competitors "
                    f"and the specific query, provide a detailed competitive analysis and strategic recommendations.\n\n"
                    f"User's query: {query}\n\n"
                    f"Competitor context:\n{competitor_text}\n\n"
                    f"Generate a comprehensive analysis with these sections:\n"
                    f"1. Executive Summary\n"
                    f"2. List of Top Competitors\n"
                    f"3. Industry Analysis\n"
                    f"4. Market Positioning\n"
                    f"5. Competitive Analysis\n"
                    f"6. Strategic Recommendations\n"
                    f"7. Risk Assessment\n"
                )
                logger.info("Used simplified fallback template")

            # Generate the analysis
            analysis = self.openai_service.generate_completion(prompt)
            logger.info(f"Generated analysis of length: {len(analysis)}")

            return analysis
        except Exception as e:
            logger.error(f"Error generating analysis: {str(e)}")
            raise

    def _chunk_text(self, text: str) -> List[str]:
        """Split text into chunks with overlap."""
        chunks = []
        start = 0
        while start < len(text):
            end = start + self.chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            start = end - self.chunk_overlap
        return chunks
