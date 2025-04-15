import chromadb
from chromadb.config import Settings
import os
from typing import List, Dict, Any
import logging
import traceback
import sys

logger = logging.getLogger(__name__)


class VectorDB:
    def __init__(self):
        # Check if running in a production environment (Cloud Run)
        is_production = os.environ.get("CLOUD_RUN", "0") == "1"
        logger.info(
            f"Initializing VectorDB in {'production' if is_production else 'local'} mode"
        )

        # Use environment variable for db_path with fallback to default
        self.db_path = os.environ.get("VECTOR_DB_PATH", "db/chroma")

        # Ensure directory exists with proper permissions
        try:
            os.makedirs(self.db_path, exist_ok=True)
            logger.info(f"Ensured vector database directory exists: {self.db_path}")
        except PermissionError as e:
            logger.error(
                f"Permission error creating directory {self.db_path}: {str(e)}"
            )
            if is_production:
                # In production, fallback to in-memory storage if persistent fails
                logger.warning(
                    "Falling back to in-memory storage in production environment"
                )
                self.db_path = None
            else:
                raise

        try:
            if self.db_path:
                # Persistent storage
                logger.info(f"Using persistent storage at {self.db_path}")
                self.client = chromadb.Client(
                    Settings(persist_directory=self.db_path, is_persistent=True)
                )
            else:
                # In-memory storage as fallback
                logger.info("Using in-memory storage")
                self.client = chromadb.Client(Settings(is_persistent=False))

            self.collection = self.client.get_or_create_collection(
                name="competitor_docs", metadata={"hnsw:space": "cosine"}
            )

            # Get current collection size for ID generation
            self.current_docs_count = len(self.collection.get()["ids"])
            logger.info(
                f"Initialized vector DB with {self.current_docs_count} existing documents"
            )
        except Exception as e:
            error_msg = f"Error initializing vector database: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            if is_production:
                # In production, try in-memory as last resort
                logger.warning(
                    "Attempting to initialize in-memory database as fallback"
                )
                try:
                    self.client = chromadb.Client(Settings(is_persistent=False))
                    self.collection = self.client.get_or_create_collection(
                        name="competitor_docs", metadata={"hnsw:space": "cosine"}
                    )
                    self.current_docs_count = 0
                    logger.info(
                        "Successfully initialized in-memory database as fallback"
                    )
                except Exception as e2:
                    logger.error(
                        f"Fatal error: In-memory fallback also failed: {str(e2)}"
                    )
                    raise RuntimeError(
                        f"Vector database initialization failed: {error_msg}\nFallback also failed: {str(e2)}"
                    )
            else:
                raise

    async def add_document(self, text: str, embedding: List[float], metadata: Dict):
        """Add a document to the vector database."""
        if not text or not embedding:
            logger.warning("Empty text or embedding provided to add_document")
            return None

        try:
            doc_id = f"doc_{self.current_docs_count}"
            self.current_docs_count += 1

            # Add better error handling for the Chroma operation
            logger.info(
                f"Adding document (id: {doc_id}) to vector DB with {len(embedding)} dimensions"
            )
            self.collection.add(
                documents=[text],
                embeddings=[embedding],
                metadatas=[metadata],
                ids=[doc_id],
            )
            logger.info(f"Successfully added document: {doc_id}")
            return doc_id
        except Exception as e:
            # Reset counter if the addition failed
            self.current_docs_count -= 1
            error_msg = f"Error adding document to vector database: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            # More informative error raising
            raise RuntimeError(error_msg)

    async def add_documents_batch(
        self,
        texts: List[str],
        embeddings: List[List[float]],
        metadatas: List[Dict[str, Any]],
    ) -> List[str]:
        """Add multiple documents to the vector database in a single operation."""
        if not texts or not embeddings or not metadatas:
            logger.warning("Empty batch provided to add_documents_batch")
            return []

        if not (len(texts) == len(embeddings) == len(metadatas)):
            error_msg = "Length mismatch: texts, embeddings, and metadatas must have same length"
            logger.error(error_msg)
            raise ValueError(error_msg)

        try:
            # Generate IDs for new documents
            doc_ids = [f"doc_{self.current_docs_count + i}" for i in range(len(texts))]
            self.current_docs_count += len(texts)

            logger.info(f"Adding batch of {len(texts)} documents to vector DB")

            self.collection.add(
                documents=texts,
                embeddings=embeddings,
                metadatas=metadatas,
                ids=doc_ids,
            )

            logger.info(f"Successfully added batch of {len(texts)} documents")
            return doc_ids
        except Exception as e:
            # Reset counter if the addition failed
            self.current_docs_count -= len(texts)
            error_msg = f"Error adding document batch to vector database: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            raise RuntimeError(error_msg)

    async def search(self, query_embedding: List[float], limit: int = 5) -> List[Dict]:
        """Search for similar documents."""
        try:
            if not query_embedding:
                logger.error("Empty query embedding provided to search")
                return []

            results = self.collection.query(
                query_embeddings=[query_embedding], n_results=limit
            )

            documents = []
            for i in range(len(results["documents"][0])):
                documents.append(
                    {
                        "text": results["documents"][0][i],
                        "metadata": results["metadatas"][0][i],
                    }
                )

            logger.info(f"Search returned {len(documents)} documents")
            return documents
        except Exception as e:
            error_msg = f"Error searching vector database: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            # Return empty results rather than failing completely
            return []

    async def clear_collection(self):
        """Clear all documents from the collection."""
        try:
            # Get the current collection
            current_collection = self.collection.get()

            # If there are documents, delete them
            if current_collection and len(current_collection["ids"]) > 0:
                logger.info(
                    f"Clearing {len(current_collection['ids'])} documents from collection"
                )
                # Delete the collection and recreate it
                self.client.delete_collection(name="competitor_docs")
                self.collection = self.client.get_or_create_collection(
                    name="competitor_docs", metadata={"hnsw:space": "cosine"}
                )

                # Reset counter
                self.current_docs_count = 0
                logger.info("Vector database collection cleared successfully")
            else:
                logger.info("No documents to clear from collection")

            return True
        except Exception as e:
            error_msg = f"Error clearing vector database collection: {str(e)}"
            logger.error(error_msg)
            logger.error(traceback.format_exc())
            raise RuntimeError(error_msg)
