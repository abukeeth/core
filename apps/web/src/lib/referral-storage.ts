const STORAGE_KEY = "ordervora-referral-code";

export function getStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setStoredReferralCode(code: string): void {
  window.localStorage.setItem(STORAGE_KEY, code);
}

export function clearStoredReferralCode(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
