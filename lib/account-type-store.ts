// Temporary store for accountType during signup process
// This helps us pass accountType from signup API to createUser event

const accountTypeStore = new Map<string, { accountType: "CORPORATE" | "AGENCY"; expiresAt: Date }>();

// Store accountType for an email (expires after 24 hours)
export function setAccountType(email: string, accountType: "CORPORATE" | "AGENCY") {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  
  accountTypeStore.set(email.toLowerCase(), { accountType, expiresAt });
  
  // Clean up expired entries periodically
  cleanupExpired();
}

// Get accountType for an email
export function getAccountType(email: string): "CORPORATE" | "AGENCY" | null {
  const entry = accountTypeStore.get(email.toLowerCase());
  
  if (!entry) {
    return null;
  }
  
  // Check if expired
  if (entry.expiresAt < new Date()) {
    accountTypeStore.delete(email.toLowerCase());
    return null;
  }
  
  return entry.accountType;
}

// Remove accountType after use
export function removeAccountType(email: string) {
  accountTypeStore.delete(email.toLowerCase());
}

// Clean up expired entries
function cleanupExpired() {
  const now = new Date();
  for (const [email, entry] of accountTypeStore.entries()) {
    if (entry.expiresAt < now) {
      accountTypeStore.delete(email);
    }
  }
}
