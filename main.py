from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from typing import List
import logging
from services.rag_service import RAGService
from services.doc_generation_service import DocGenerationService

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Competitor Analysis RAG System")

# Create output directory if it doesn't exist
os.makedirs("output", exist_ok=True)

# Mount the output directory
app.mount("/output", StaticFiles(directory="output"), name="output")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite's default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rag_service = RAGService()
doc_service = DocGenerationService()

@app.get("/")
async def root():
    """Welcome endpoint with basic API information."""
    return {
        "message": "Welcome to the Competitor Analysis RAG System",
        "endpoints": {
            "/upload-documents": "POST - Upload competitor documents for analysis",
            "/analyze-competitors": "POST - Generate competitor analysis",
            "/docs": "GET - View API documentation"
        }
    }

@app.post("/upload-documents")
async def upload_documents(files: List[UploadFile] = File(...)):
    """Upload and process documents into the vector database."""
    try:
        logger.info(f"Received {len(files)} files")
        for file in files:
            logger.info(f"Processing file: {file.filename}")
            content = await file.read()
            await rag_service.process_document(content, file.filename)
        return {"message": "Documents processed successfully"}
    except Exception as e:
        logger.error(f"Error processing documents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/download/{filename}")
async def download_file(filename: str):
    """Download a generated analysis file."""
    file_path = os.path.join("output", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        file_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename
    )

@app.post("/analyze-competitors")
async def analyze_competitors(query: str):
    """Generate competitor analysis based on stored documents."""
    try:
        logger.info(f"Received analysis query: {query}")
        context = await rag_service.get_relevant_context(query)
        logger.info(f"Retrieved {len(context)} relevant contexts")
        
        analysis = await rag_service.generate_analysis(query, context)
        logger.info("Generated analysis")
        
        doc_path = await doc_service.create_analysis_document(analysis)
        filename = os.path.basename(doc_path)
        download_url = f"/download/{filename}"
        
        logger.info(f"Created document at: {doc_path}")
        
        return {
            "message": "Analysis completed",
            "document_path": download_url,
            "summary": analysis[:500] + "..."
        }
    except Exception as e:
        logger.error(f"Error analyzing competitors: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 