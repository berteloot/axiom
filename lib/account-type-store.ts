// Temporary store for accountType and accountName during signup process
// This helps us pass accountType and accountName from signup API to createUser event

const accountTypeStore = new Map<string, { accountType: "CORPORATE" | "AGENCY"; accountName?: string; expiresAt: Date }>();

// Store accountType and optional accountName for an email (expires after 24 hours)
export function setAccountType(email: string, accountType: "CORPORATE" | "AGENCY", accountName?: string) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  
  accountTypeStore.set(email.toLowerCase(), { accountType, accountName, expiresAt });
  
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

// Get accountName for an email
export function getAccountName(email: string): string | null {
  const entry = accountTypeStore.get(email.toLowerCase());
  
  if (!entry) {
    return null;
  }
  
  // Check if expired
  if (entry.expiresAt < new Date()) {
    accountTypeStore.delete(email.toLowerCase());
    return null;
  }
  
  return entry.accountName || null;
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
