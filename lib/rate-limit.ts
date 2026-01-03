/**
 * Simple in-memory rate limiting for email sending
 * For production, use Redis or a proper rate limiting service
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check if email sending is rate limited
 * @param identifier - Email address or IP address
 * @param maxAttempts - Maximum attempts allowed
 * @param windowMs - Time window in milliseconds
 * @returns Object with `allowed` boolean and `retryAfter` seconds if limited
 */
export function checkRateLimit(
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 60 * 60 * 1000 // 1 hour default
): { allowed: boolean; retryAfter?: number } {
  const key = identifier.toLowerCase().trim();
  const now = Date.now();
  
  const entry = rateLimitStore.get(key);
  
  // No entry or window expired - allow request
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true };
  }
  
  // Within window but under limit - increment
  if (entry.count < maxAttempts) {
    entry.count++;
    return { allowed: true };
  }
  
  // Over limit - calculate retry after
  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
  return { allowed: false, retryAfter };
}

/**
 * Get rate limit info without incrementing
 */
export function getRateLimitInfo(
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 60 * 60 * 1000
): { remaining: number; resetAt: number } {
  const key = identifier.toLowerCase().trim();
  const entry = rateLimitStore.get(key);
  
  if (!entry || Date.now() > entry.resetAt) {
    return { remaining: maxAttempts, resetAt: Date.now() + windowMs };
  }
  
  return {
    remaining: Math.max(0, maxAttempts - entry.count),
    resetAt: entry.resetAt,
  };
}
