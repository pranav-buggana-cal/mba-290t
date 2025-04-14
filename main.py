from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from services.auth_service import (
    authenticate_user,
    create_access_token,
    get_current_active_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from services.rate_limiter import rate_limiter
from services.storage_service import storage_service
from datetime import timedelta, datetime
import os
from typing import List, Dict, Any, Optional
import logging
from services.rag_service import RAGService
from services.openai_service import OpenAIService
from db.vector_db import VectorDB
from services.doc_generation_service import DocGenerationService
from pydantic import BaseModel
import json

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Competitor Analysis RAG System",
    # Configure maximum upload size to 200MB
    max_upload_size=200 * 1024 * 1024,  # 200MB in bytes
)

# Create output directory if it doesn't exist
os.makedirs("output", exist_ok=True)

# Create directory for LangChain vector store
os.makedirs("db/langchain_chroma", exist_ok=True)

# Mount the output directory
app.mount("/output", StaticFiles(directory="output"), name="output")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:3001"
    ).split(
        ","
    ),  # Allow both local and production URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
openai_service = OpenAIService()
vector_db = VectorDB()
rag_service = RAGService(openai_service, vector_db)
doc_service = DocGenerationService()


# Models
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: str


class SuccessResponse(BaseModel):
    message: str


# Storage models
class GetUploadUrlRequest(BaseModel):
    fileName: str
    contentType: str
    size: int


class GetUploadUrlResponse(BaseModel):
    uploadUrl: str
    fileId: str
    expiresAt: int


class CompleteUploadRequest(BaseModel):
    fileId: str
    fileType: str
    storagePath: Optional[str] = None
    contentType: Optional[str] = None


class CompleteUploadResponse(BaseModel):
    success: bool
    message: str
    fileDetails: Dict[str, Any]


# Global authentication middleware
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Skip authentication for these paths and OPTIONS requests
    if (
        request.url.path in ["/token", "/docs", "/openapi.json", "/health"]
        or request.method == "OPTIONS"
    ):
        return await call_next(request)

    # Check for Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return await call_next(request)


@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    # Skip rate limiting for these paths and OPTIONS requests
    if (
        request.url.path
        in [
            "/docs",
            "/openapi.json",
            "/token",
            "/health",
            "/storage/get-upload-url",
            "/storage/complete-upload",
        ]
        or request.method == "OPTIONS"
    ):
        return await call_next(request)

    # For all other paths, apply rate limiting
    await rate_limiter.check_rate_limit(request)
    response = await call_next(request)
    return response


@app.get("/health")
async def health_check():
    """Health check endpoint for the API."""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/")
async def root(current_user: dict = Depends(get_current_active_user)):
    """Welcome endpoint with basic API information."""
    return {
        "message": "Welcome to the Competitor Analysis RAG System",
        "endpoints": {
            "/token": "POST - Login to get access token",
            "/upload-documents": "POST - Upload competitor documents for analysis",
            "/storage/get-upload-url": "POST - Get signed URL for large file uploads",
            "/storage/complete-upload": "POST - Complete a large file upload",
            "/analyze-competitors": "POST - Generate competitor analysis",
            "/docs": "GET - View API documentation",
        },
    }


# New storage endpoints for large file uploads
@app.post("/storage/get-upload-url", response_model=GetUploadUrlResponse)
async def get_upload_url(
    request: GetUploadUrlRequest, current_user: dict = Depends(get_current_active_user)
):
    """
    Get a signed URL for uploading a large file directly to storage.

    This endpoint generates a temporary signed URL that the client can use
    to upload a file directly to the storage service without going through the API.
    """
    try:
        log_msg = (
            f"Getting upload URL for file: {request.fileName} ({request.size} bytes)"
        )
        logger.info(log_msg)

        # Validate request
        if not request.fileName:
            raise HTTPException(status_code=400, detail="File name is required")

        if not request.contentType:
            raise HTTPException(status_code=400, detail="Content type is required")

        # Validate file size
        max_size = 150 * 1024 * 1024  # 150MB
        if request.size <= 0:
            raise HTTPException(
                status_code=400, detail="File size must be greater than 0"
            )

        if request.size > max_size:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"File size exceeds maximum allowed size of "
                    f"{max_size // (1024 * 1024)}MB"
                ),
            )

        # Generate signed URL
        try:
            result = storage_service.get_upload_url(
                file_name=request.fileName,
                content_type=request.contentType,
                file_size=request.size,
            )

            logger.info(f"Generated upload URL for file: {request.fileName}")
            return result

        except Exception as e:
            logger.error(f"Error generating upload URL: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Failed to generate upload URL: {str(e)}"
            )

    except HTTPException:
        # Re-raise HTTP exceptions without modification
        raise
    except Exception as e:
        logger.error(f"Unhandled error generating upload URL: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/storage/complete-upload", response_model=CompleteUploadResponse)
async def complete_upload(
    request: CompleteUploadRequest,
    current_user: dict = Depends(get_current_active_user),
):
    """
    Complete an upload process by processing a file that was uploaded to storage.

    After a client has uploaded a file to storage using a signed URL, this endpoint
    should be called to verify the upload and process the file.
    """
    try:
        log_msg = (
            f"Completing upload for file ID: {request.fileId}, type: {request.fileType}"
        )
        logger.info(log_msg)

        if not request.fileId:
            raise HTTPException(status_code=400, detail="File ID is required")

        if request.fileType not in ["competitor", "business"]:
            error_msg = (
                f"Invalid file type: {request.fileType}. "
                f"Must be 'competitor' or 'business'."
            )
            logger.error(error_msg)
            raise HTTPException(status_code=400, detail=error_msg)

        # Verify the file exists in storage
        try:
            file_details = storage_service.complete_upload(
                file_id=request.fileId, storage_path=request.storagePath
            )
        except HTTPException as e:
            logger.error(f"Storage error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error accessing storage: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Failed to verify file in storage: {str(e)}"
            )

        # Download the file from storage
        try:
            file_content = storage_service.download_file(
                file_id=request.fileId, storage_path=request.storagePath
            )
        except HTTPException as e:
            logger.error(f"Download error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error downloading file: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to download file from storage: {str(e)}",
            )

        # Process the file based on its type
        try:
            filename = file_details.get("name", f"{request.fileId}")
            # Pass the content type if provided
            content_type = request.contentType or file_details.get("contentType", "")
            process_result = await rag_service.process_document(
                file_content,
                filename,
                file_type=request.fileType,
                content_type=content_type,
            )

            # Include processing details in the response
            processing_details = {
                "total_chunks": process_result.get("total_chunks", 0),
                "processed_chunks": process_result.get("processed_chunks", 0),
                "processing_status": process_result.get("status", "success"),
            }
        except Exception as e:
            logger.error(f"Error processing document: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Failed to process document: {str(e)}"
            )

        logger.info(
            f"Successfully completed upload and processing for {request.fileId}"
        )
        return {
            "success": True,
            "message": (
                f"{request.fileType.capitalize()} document processed successfully"
            ),
            "fileDetails": file_details,
            "processingDetails": processing_details,
        }
    except HTTPException:
        # Re-raise HTTP exceptions without modification
        raise
    except Exception as e:
        logger.error(f"Error completing upload: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload-documents")
async def upload_documents(
    files: List[UploadFile] = File(...),
    file_type: str = "competitor",
    current_user: dict = Depends(get_current_active_user),
):
    """Upload and process documents into the vector database."""
    try:
        logger.info(f"Received {len(files)} files of type: {file_type}")
        for file in files:
            logger.info(f"Processing file: {file.filename}")
            content = await file.read()
            await rag_service.process_document(
                content, file.filename, file_type=file_type
            )
        return {"message": "Documents processed successfully"}
    except Exception as e:
        logger.error(f"Error processing documents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/download/{filename}")
async def download_file(
    filename: str, current_user: dict = Depends(get_current_active_user)
):
    """Download a generated analysis file."""
    file_path = os.path.join("output", filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        file_path,
        media_type=(
            "application/vnd.openxmlformats-officedocument" ".wordprocessingml.document"
        ),
        filename=filename,
    )


@app.post("/upload-competitor", response_model=SuccessResponse)
async def upload_competitor(file: UploadFile = File(...)):
    """Upload a competitor document for analysis."""
    try:
        file_content = await file.read()
        await rag_service.process_document(
            file_content, file.filename, file_type="competitor"
        )
        return {"message": "Competitor document uploaded successfully"}
    except Exception as e:
        logger.error(f"Error uploading competitor document: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error uploading document: {str(e)}"
        )


@app.post("/upload-business", response_model=SuccessResponse)
async def upload_business(file: UploadFile = File(...)):
    """Upload a business document for analysis."""
    try:
        file_content = await file.read()
        await rag_service.process_document(
            file_content, file.filename, file_type="business"
        )
        return {"message": "Business document uploaded successfully"}
    except Exception as e:
        logger.error(f"Error uploading business document: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error uploading document: {str(e)}"
        )


@app.post("/analyze-competitors", response_model=Dict[str, Any])
async def analyze_competitors(query: str):
    """Generate a competitor analysis based on the provided query."""
    try:
        logger.info(f"Received analyze-competitors request with query: {query}")

        # Get relevant context separately for competitors and business
        context = await rag_service.get_relevant_context(query)

        # Generate the analysis using the context
        logger.info("Generating analysis...")
        analysis = await rag_service.generate_analysis(query, context)

        # Log analysis length and first 100 chars
        logger.info(f"Analysis generated. Length: {len(analysis)} chars")
        logger.info(f"Analysis preview: {analysis[:100]}...")

        # Create a timestamped document with the analysis
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        doc_path = f"output/{timestamp}_analysis.md"
        os.makedirs("output", exist_ok=True)

        with open(doc_path, "w") as f:
            f.write(analysis)

        # Create a summary (first 1000 chars if analysis is long)
        summary = analysis[:1000] + "..." if len(analysis) > 1000 else analysis

        # Return the response with the complete analysis
        response_data = {
            "message": "Analysis generated successfully",
            "doc_path": doc_path,
            "summary": summary,
            "analysis": analysis,  # Include the full analysis in the response
        }

        # Log response data structure for debugging
        logger.info(f"Response data keys: {list(response_data.keys())}")
        logger.info(f"Analysis key exists: {'analysis' in response_data}")
        logger.info(f"Analysis value type: {type(response_data['analysis'])}")
        logger.info(f"Analysis value length: {len(response_data['analysis'])}")

        # Clear the vector database after successful analysis
        try:
            logger.info("Clearing vector database after analysis...")
            await rag_service.clear_vector_db()
            logger.info("Vector database cleared successfully")
        except Exception as e:
            logger.warning(f"Failed to clear vector database: {str(e)}")
            # Don't fail the request if clearing fails

        # Use a custom JSONResponse with a higher maximum size limit
        # Directly construct the JSON string to avoid any truncation
        json_str = json.dumps(response_data)
        logger.info(f"JSON response length: {len(json_str)} bytes")

        # Return the response with explicit content-type and no size limits
        return JSONResponse(
            content=response_data, status_code=200, media_type="application/json"
        )
    except Exception as e:
        logger.error(f"Error generating analysis: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error generating analysis: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
