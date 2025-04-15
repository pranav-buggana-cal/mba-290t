#!/bin/bash
set -e

# Build and deploy backend
gcloud builds submit --tag gcr.io/genai-strategy-class/competitor-analysis-backend --timeout=1800 .

# Build and deploy frontend
cd frontend
gcloud builds submit --tag gcr.io/genai-strategy-class/competitor-analysis-frontend --timeout=1800 .
cd ..

# Build proxy with updated dependencies
cd proxy
npm install
gcloud builds submit --tag gcr.io/genai-strategy-class/competitor-analysis-proxy --timeout=1800 .
cd ..

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# Replace timestamps in yaml files
sed -i.bak "s/\$(date +%Y%m%d%H%M%S)/$TIMESTAMP/g" cloudrun-backend.yaml
sed -i.bak "s/\$(date +%Y%m%d%H%M%S)/$TIMESTAMP/g" cloudrun-proxy.yaml
sed -i.bak "s/\$(date +%Y%m%d%H%M%S)/$TIMESTAMP/g" cloudrun-frontend.yaml

# Deploy services
gcloud run services replace cloudrun-backend.yaml --region=us-central1
gcloud run services replace cloudrun-proxy.yaml --region=us-central1
gcloud run services replace cloudrun-frontend.yaml --region=us-central1