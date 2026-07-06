import time
import logging
from fastapi import Request, HTTPException, status
import redis

from app.core.config import settings

logger = logging.getLogger("contractor_crm.rate_limit")

# Lazy initialization of Redis client
_redis_client = None

def get_redis_client():
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
            _redis_client.ping()
            logger.info("🔌 Redis client successfully connected for Rate Limiting.")
        except Exception as e:
            logger.warning(f"⚠️ Redis is not available or failed to connect ({str(e)}). Rate limiting will run in fallback (noop) mode.")
            _redis_client = False
    return _redis_client if _redis_client is not False else None


class RateLimiter:
    """
    FastAPI dependency for sliding-window rate limiting backed by Redis.
    Limits requests to 'requests_limit' within 'window_seconds'.
    """
    def __init__(self, requests_limit: int = 100, window_seconds: int = 60):
        self.requests_limit = requests_limit
        self.window_seconds = window_seconds

    def __call__(self, request: Request):
        client = get_redis_client()
        if not client:
            return  # Fail-open if Redis is down
            
        ip = request.client.host if request.client else "unknown"
        path = request.url.path
        
        # Redis key format: rate_limit:{ip}:{path}
        key = f"rate_limit:{ip}:{path}"
        
        try:
            current_time = time.time()
            pipe = client.pipeline()
            # 1. Purge requests older than sliding window threshold
            pipe.zremrangebyscore(key, 0, current_time - self.window_seconds)
            # 2. Get current request count in this window
            pipe.zcard(key)
            # 3. Add current request timestamp to the set
            # We use a unique member name to avoid overriding same-millisecond requests
            member_id = f"{current_time}-{id(request)}"
            pipe.zadd(key, {member_id: current_time})
            # 4. Set key TTL to keep Redis clean
            pipe.expire(key, self.window_seconds)
            
            results = pipe.execute()
            request_count = results[1]
            
            if request_count >= self.requests_limit:
                logger.warning(f"🚨 Rate limit exceeded for IP {ip} on path {path} ({request_count}/{self.requests_limit} requests).")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="تعداد درخواست‌های ارسالی شما بیش از حد مجاز است. لطفاً کمی صبر کرده و سپس مجدداً تلاش فرمایید."
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"❌ Rate limiter Redis error: {str(e)}")
            return  # Fail-open on general Redis failures
