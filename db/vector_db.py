import chromadb
from chromadb.config import Settings
import os
from typing import List, Dict


class VectorDB:
    def __init__(self):
        self.db_path = "db/chroma"
        os.makedirs(self.db_path, exist_ok=True)

        self.client = chromadb.Client(
            Settings(persist_directory=self.db_path, is_persistent=True)
        )

        self.collection = self.client.get_or_create_collection(
            name="competitor_docs", metadata={"hnsw:space": "cosine"}
        )

    async def add_document(self, text: str, embedding: List[float], metadata: Dict):
        """Add a document to the vector database."""
        self.collection.add(
            documents=[text],
            embeddings=[embedding],
            metadatas=[metadata],
            ids=[f"doc_{len(self.collection.get()['ids'])}"],
        )

    async def search(self, query_embedding: List[float], limit: int = 5) -> List[Dict]:
        """Search for similar documents."""
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

        return documents

    async def clear_collection(self):
        """Clear all documents from the collection."""
        # Get the current collection
        current_collection = self.collection.get()

        # If there are documents, delete them
        if current_collection and len(current_collection["ids"]) > 0:
            # Delete the collection and recreate it
            self.client.delete_collection(name="competitor_docs")
            self.collection = self.client.get_or_create_collection(
                name="competitor_docs", metadata={"hnsw:space": "cosine"}
            )
        return True
