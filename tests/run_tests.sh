#!/bin/bash
set -e

# Check if required tools are installed
command -v python3 >/dev/null 2>&1 || { echo "Python 3 is required but not installed. Aborting."; exit 1; }
command -v pip >/dev/null 2>&1 || { echo "pip is required but not installed. Aborting."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required but not installed. Aborting."; exit 1; }
command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required but not installed. Aborting."; exit 1; }

# Change to the project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR/.."

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r tests/requirements.txt

# Verify proxy server dependencies
echo "Verifying proxy server dependencies..."
if [ ! -d "proxy/node_modules" ]; then
  echo "Installing proxy server dependencies..."
  (cd proxy && npm install)
fi

# Run the tests
echo "Running API tests..."
python3 tests/test_api.py

# Exit with the status code from the tests
exit $? 