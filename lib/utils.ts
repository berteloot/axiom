import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely parse JSON response from fetch, handling HTML redirects gracefully
 * @param response - The fetch Response object
 * @returns Parsed JSON data
 * @throws Error if response is not JSON (e.g., HTML redirect)
 */
export async function parseJsonResponse<T = any>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  const isHtml = text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html");
  const fallbackMessage = isHtml
    ? "Session expired or server returned HTML instead of JSON. Please refresh and try again."
    : "Server returned an unexpected response format.";
  throw new Error(fallbackMessage);
}
