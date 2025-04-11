#!/bin/bash

# Exit on error
set -e

# Check if PROJECT_ID is set
if [ -z "$PROJECT_ID" ]; then
    echo "❌ Error: PROJECT_ID environment variable is not set"
    exit 1
fi

echo "🚀 Building and deploying to project: $PROJECT_ID"

# Build and push backend image
echo "📦 Building backend image..."
docker build -t gcr.io/${PROJECT_ID}/competitor-analysis-backend -f Dockerfile.backend .
docker push gcr.io/${PROJECT_ID}/competitor-analysis-backend

# Build and push frontend image
echo "📦 Building frontend image..."
docker build -t gcr.io/${PROJECT_ID}/competitor-analysis-frontend -f frontend/Dockerfile frontend
docker push gcr.io/${PROJECT_ID}/competitor-analysis-frontend

# Deploy backend
echo "🚀 Deploying backend..."
envsubst < cloudrun-backend.yaml | gcloud run services replace - --platform managed --region us-central1

# Deploy frontend
echo "🚀 Deploying frontend..."
envsubst < cloudrun-frontend.yaml | gcloud run services replace - --platform managed --region us-central1

echo "✨ Deployment complete!"
echo "Frontend URL: https://competitor-analysis-frontend-${PROJECT_ID}.a.run.app"
echo "Backend URL: https://competitor-analysis-backend-${PROJECT_ID}.a.run.app" 