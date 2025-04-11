from typing import Dict, List
from fastapi import HTTPException, Request
import time


class RateLimiter:
    def __init__(self, requests_per_minute: int = 10):
        self.requests_per_minute = requests_per_minute
        self.requests: Dict[str, List[float]] = {}

    def _clean_old_requests(self, user_id: str):
        """Remove requests older than 1 minute"""
        now = time.time()
        minute_ago = now - 60
        self.requests[user_id] = [
            req_time for req_time in self.requests[user_id] if req_time > minute_ago
        ]

    async def check_rate_limit(self, request: Request):
        """Check if the request should be rate limited"""
        user = request.state.user if hasattr(request.state, "user") else None
        user_id = user["username"] if user else request.client.host

        # Initialize request list for new users
        if user_id not in self.requests:
            self.requests[user_id] = []

        # Clean old requests
        self._clean_old_requests(user_id)

        # Check rate limit
        if len(self.requests[user_id]) >= self.requests_per_minute:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please try again in a minute.",
            )

        # Add current request
        self.requests[user_id].append(time.time())


rate_limiter = RateLimiter()
