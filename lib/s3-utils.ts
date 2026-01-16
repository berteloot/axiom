/**
 * Sanitize a string for use in S3 metadata (HTTP headers)
 * HTTP headers cannot contain control characters, newlines, or certain special characters
 * AWS S3 metadata has stricter requirements than standard HTTP headers
 * This function ensures only safe ASCII printable characters are used
 * @param value - The string to sanitize
 * @param maxLength - Maximum length (default: 2000)
 * @returns Sanitized string safe for HTTP headers
 */
export function sanitizeS3Metadata(value: string, maxLength: number = 2000): string {
  if (!value) return "";
  
  return value
    // Convert smart quotes and other Unicode quotes to regular quotes
    .replace(/['']/g, "'")  // Left/right single quotes to straight quote
    .replace(/[""]/g, '"')  // Left/right double quotes to straight quote
    // Replace em dashes and en dashes with hyphens
    .replace(/[—–]/g, "-")
    // Remove control characters (0x00-0x1F, 0x7F)
    .replace(/[\x00-\x1F\x7F]/g, "")
    // Replace newlines and carriage returns with spaces
    .replace(/[\r\n]+/g, " ")
    // Replace tabs with spaces
    .replace(/\t/g, " ")
    // Replace multiple spaces with single space
    .replace(/\s+/g, " ")
    // Only keep ASCII printable characters (32-126)
    // This includes: space, ! " # $ % & ' ( ) * + , - . / 0-9 : ; < = > ? @ A-Z [ \ ] ^ _ ` a-z { | } ~
    .replace(/[^\x20-\x7E]/g, "")
    // Trim whitespace
    .trim()
    // Limit length
    .substring(0, maxLength);
}
