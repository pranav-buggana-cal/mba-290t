import logging
from typing import List, Dict
import os
from .openai_service import OpenAIService
from db.vector_db import VectorDB
from PyPDF2 import PdfReader
from docx import Document
import io

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
                self.prompts = {}
                sections = content.split("#")[1:]  # Split by # and remove empty first element
                for section in sections:
                    lines = section.strip().split("\n")
                    name = lines[0].strip()
                    template = "\n".join(lines[1:]).strip()
                    self.prompts[name] = template
        except FileNotFoundError:
            raise FileNotFoundError(f"Could not find prompts file at {prompts_path}")
        except Exception as e:
            raise Exception(f"Error loading prompts: {str(e)}")

    def _extract_text_from_file(self, content: bytes, filename: str) -> str:
        """Extract text from different file types."""
        file_extension = os.path.splitext(filename.lower())[1]
        
        try:
            if file_extension == '.pdf':
                # Handle PDF files
                pdf_file = io.BytesIO(content)
                pdf_reader = PdfReader(pdf_file)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
                return text

            elif file_extension == '.docx':
                # Handle DOCX files
                doc_file = io.BytesIO(content)
                doc = Document(doc_file)
                text = ""
                for paragraph in doc.paragraphs:
                    text += paragraph.text + "\n"
                return text

            elif file_extension == '.txt':
                # Handle plain text files
                return content.decode('utf-8')

            else:
                raise ValueError(f"Unsupported file type: {file_extension}")

        except Exception as e:
            logger.error(f"Error extracting text from {filename}: {str(e)}")
            raise

    async def process_document(self, content: bytes, filename: str):
        """Process and store a document in the vector database."""
        try:
            logger.info(f"Processing document: {filename}")
            
            # Extract text based on file type
            text = self._extract_text_from_file(content, filename)
            logger.info(f"Successfully extracted text from {filename}")
            
            # Remove any null bytes and normalize whitespace
            text = text.replace('\x00', '').strip()
            text = ' '.join(text.split())
            
            if not text:
                raise ValueError(f"No text content extracted from {filename}")

            chunks = self._chunk_text(text)
            logger.info(f"Created {len(chunks)} chunks")
            
            for i, chunk in enumerate(chunks):
                if chunk.strip():  # Only process non-empty chunks
                    logger.info(f"Processing chunk {i+1}/{len(chunks)}")
                    embedding = self.openai_service.get_embedding(chunk)
                    await self.vector_db.add_document(
                        text=chunk,
                        embedding=embedding,
                        metadata={"source": filename}
                    )
            logger.info(f"Successfully processed document: {filename}")
            
        except Exception as e:
            logger.error(f"Error processing document: {str(e)}")
            raise

    async def get_relevant_context(self, query: str) -> List[Dict]:
        """Retrieve relevant context for a query."""
        try:
            logger.info(f"Getting embedding for query: {query}")
            query_embedding = self.openai_service.get_embedding(query)
            logger.info("Searching vector database")
            return await self.vector_db.search(query_embedding, limit=5)
        except Exception as e:
            logger.error(f"Error getting relevant context: {str(e)}")
            raise

    async def generate_analysis(self, query: str, context: List[Dict]) -> str:
        """Generate analysis using RAG."""
        try:
            context_text = "\n\n".join([doc["text"] for doc in context])
            logger.info("Generating analysis with context length: %d", len(context_text))
            prompt = self.prompts["Competitor Analysis Template"].format(
                context=context_text,
                query=query
            )
            return self.openai_service.generate_completion(prompt)
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