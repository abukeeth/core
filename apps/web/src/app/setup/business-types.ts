import type { BusinessType } from "@/lib/api";

/**
 * The nine supported business verticals (+ Other), with the emoji/label used
 * across onboarding. Shared by the legacy wizard's Business Type step and the
 * Onboarding V3 create screen so the two flows never drift apart.
 */
export const BUSINESS_TYPES: { value: BusinessType; label: string; icon: string }[] = [
  { value: "RESTAURANT", label: "Restaurant", icon: "🍽️" },
  { value: "COFFEE_SHOP", label: "Coffee Shop", icon: "☕" },
  { value: "DELI", label: "Deli", icon: "🥪" },
  { value: "VAPE_SHOP", label: "Vape Shop", icon: "💨" },
  { value: "CONVENIENCE_STORE", label: "Convenience Store", icon: "🏪" },
  { value: "BAKERY", label: "Bakery", icon: "🥐" },
  { value: "PIZZA", label: "Pizza", icon: "🍕" },
  { value: "RETAIL", label: "Retail", icon: "🛍️" },
  { value: "OTHER", label: "Other", icon: "✨" },
];
