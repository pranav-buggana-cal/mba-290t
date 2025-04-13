# API Testing Framework

This directory contains automated tests for the Competitor Analysis API.

## Requirements

- Python 3.9+
- Node.js 18+
- Google Cloud SDK (gcloud)
- Access to Google Secret Manager with appropriate service account credentials

## Running Tests Locally

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Make sure the proxy server dependencies are installed:
   ```bash
   cd ../proxy
   npm install
   cd ../tests
   ```

3. Run the tests:
   ```bash
   python test_api.py
   ```

The test script will:

1. Start the proxy server
2. Retrieve credentials from Google Secret Manager
3. Test the authentication endpoint
4. Test the document upload endpoint
5. Test the competitor analysis endpoint
6. Test the document download endpoint
7. Clean up resources and report results

## CI/CD Integration

These tests are also configured to run in GitHub Actions. For this to work, you'll need to:

1. Add a repository secret called `GCP_SA_KEY` containing a service account JSON key with access to Secret Manager
2. Create the necessary secrets in Google Secret Manager:
   - `auth-username`
   - `auth-password`

The GitHub Actions workflow is defined in `.github/workflows/api-tests.yml`.

## Test Architecture

The tests are designed to work with the following components:

1. Backend service running on Google Cloud Run
2. Local proxy server for handling CORS
3. Frontend application (tested indirectly)

Each test verifies a specific endpoint of the API, simulating user interactions through the proxy server. 