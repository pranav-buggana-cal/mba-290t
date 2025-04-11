# AI Chat Application

A full-stack application with a FastAPI backend and React frontend, featuring OpenAI integration and JWT authentication.

## Prerequisites

- Docker and Docker Compose
- OpenAI API key
- Node.js (for local development)

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your environment variables:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` with your actual values:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `JWT_SECRET_KEY`: A secure random string for JWT token signing
   - `CORS_ORIGINS`: The URL of your frontend application

## Running with Docker

To start the application:

```bash
docker-compose up --build
```

This will:
- Build and start the backend service on port 8000
- Build and start the frontend service on port 3000
- Set up all necessary environment variables

## Development

For local development without Docker:

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## API Documentation

Once the application is running, you can access the API documentation at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Security Features

- JWT-based authentication
- Rate limiting (10 requests per minute per user)
- CORS protection
- Environment variable configuration
- Secure API key management

## License

MIT