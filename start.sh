#!/bin/bash

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Please create a .env file with the following variables:"
    echo "AUTH_USERNAME=your_username"
    echo "AUTH_PASSWORD=your_password"
    echo "JWT_SECRET_KEY=your_jwt_secret"
    echo "OPENAI_API_KEY=your_openai_api_key"
    exit 1
fi

# Load environment variables
set -a
source .env
set +a

# Check for required environment variables
required_vars=("AUTH_USERNAME" "AUTH_PASSWORD" "JWT_SECRET_KEY" "OPENAI_API_KEY")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Error: $var is not set in .env file"
        exit 1
    fi
done

echo "🔄 Stopping existing processes..."

# Kill any existing Python/FastAPI processes
pkill -f "python main.py" || true
pkill -f "uvicorn" || true

# Kill any existing Node/Vite processes
pkill -f "vite" || true
pkill -f "node" || true

echo "🧹 Cleaning up..."
sleep 2  # Wait for processes to fully terminate

echo "🚀 Starting backend server..."
# Start the FastAPI backend in the background with environment variables
python main.py &
BACKEND_PID=$!

echo "⏳ Waiting for backend to initialize..."
sleep 3  # Give the backend some time to start

echo "🚀 Starting frontend server..."
# Navigate to frontend directory and start the dev server
cd frontend
npm run dev &
FRONTEND_PID=$!

echo "✨ Servers started!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "📝 Access points:"
echo "Frontend: http://localhost:5173"
echo "Backend API: http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "🔑 Login credentials:"
echo "Username: $AUTH_USERNAME"
echo "Password: $AUTH_PASSWORD"
echo ""
echo "Press Ctrl+C to stop all servers"

# Use trap to handle cleanup when the script exits
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "🛑 All servers stopped"
    exit 0
}

# Set up trap for script termination
trap cleanup SIGINT SIGTERM

# Wait for processes more compatibly
while kill -0 $BACKEND_PID 2>/dev/null && kill -0 $FRONTEND_PID 2>/dev/null; do
    sleep 1
done

# If we get here, one of the processes died
echo "❌ A server process has terminated"
cleanup 