"use client";

const AUTH_REQUEST_TTL_MS = 5 * 60 * 1000;

interface StoredAuthRequestKey {
  key: string;
  createdAt: number;
}

function storageKey(action: string, identity: string): string {
  return `ordervora-auth-request:${action}:${identity.toLowerCase()}`;
}

function generateRequestKey(action: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${action}:${crypto.randomUUID()}`;
  }
  return `${action}:${Math.random().toString(36).slice(2)}:${Date.now()}`;
}

export function getOrCreateAuthRequestKey(action: string, identity: string): string {
  if (typeof window === "undefined") {
    return generateRequestKey(action);
  }
  const keyName = storageKey(action, identity || "anonymous");
  const raw = window.sessionStorage.getItem(keyName);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredAuthRequestKey;
      if (Date.now() - parsed.createdAt < AUTH_REQUEST_TTL_MS && parsed.key) {
        return parsed.key;
      }
    } catch {
      // Ignore invalid cache and overwrite.
    }
  }
  const created: StoredAuthRequestKey = { key: generateRequestKey(action), createdAt: Date.now() };
  window.sessionStorage.setItem(keyName, JSON.stringify(created));
  return created.key;
}

export function clearAuthRequestKey(action: string, identity: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(storageKey(action, identity || "anonymous"));
}
