#!/bin/bash
set -e

# Function to start a process in the background
start_service() {
  SERVICE_NAME=$1
  COMMAND=$2
  DIR=$3
  echo "Starting $SERVICE_NAME..."
  
  # Change to the specified directory
  cd "$DIR"
  
  # Start the process in the background
  $COMMAND &
  PID=$!
  
  # Return to the original directory
  cd - > /dev/null
  
  # Store the PID for later cleanup
  echo $PID > ".${SERVICE_NAME}_pid"
  echo "$SERVICE_NAME started with PID $PID"
}

# Function to cleanup processes on exit
cleanup() {
  echo "Cleaning up processes..."
  for PID_FILE in ./*_pid; do
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      echo "Stopping process with PID $PID..."
      kill $PID 2>/dev/null || true
      rm "$PID_FILE"
    fi
  done
  echo "Cleanup complete"
}

# Set up trap to cleanup on script exit
trap cleanup EXIT INT TERM

echo "========================================"
echo "Starting Competitor Analysis Application"
echo "========================================"

# Start the proxy server
start_service "proxy" "npm start" "proxy"

# Start the frontend
start_service "frontend" "npm run dev" "frontend"

echo "========================================"
echo "All services started successfully!"
echo "- Frontend: http://localhost:5173"
echo "- Proxy: http://localhost:3001"
echo "- Backend: https://competitor-analysis-backend-342114956303.us-central1.run.app"
echo "========================================"
echo "Press Ctrl+C to stop all services"

# Wait for user to press Ctrl+C
wait 