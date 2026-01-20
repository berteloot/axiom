/**
 * Email domain validation utilities
 * Restricts access to only authorized email domains
 */

const ALLOWED_EMAIL_DOMAINS = ["nytromarketing.com"];

// Admin emails that bypass domain restrictions
const ADMIN_EMAILS = ["berteloot@gmail.com", "melissa@cleardigitallabs.com"];

/**
 * Check if an email address is from an allowed domain or is an admin email
 * @param email The email address to validate
 * @returns true if the email is from an allowed domain or is an admin email, false otherwise
 */
export function isAllowedEmailDomain(email: string): boolean {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return false;
  }

  const normalizedEmail = email.toLowerCase().trim();
  
  // Check if it's an admin email (bypasses domain restriction)
  if (ADMIN_EMAILS.includes(normalizedEmail)) {
    return true;
  }

  const domain = normalizedEmail.split("@")[1];

  if (!domain) {
    return false;
  }

  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

/**
 * Get the error message for unauthorized email domains
 * @returns Error message string
 */
export function getEmailDomainError(): string {
  return "Access is restricted to @NytroMarketing.com email addresses only.";
}
