export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "RESTAURANT_OWNER" | "RESTAURANT_STAFF";
  isActive: boolean;
  emailVerified: boolean;
  phone: string | null;
}

export type BusinessType =
  | "RESTAURANT"
  | "COFFEE_SHOP"
  | "DELI"
  | "VAPE_SHOP"
  | "CONVENIENCE_STORE"
  | "BAKERY"
  | "PIZZA"
  | "RETAIL"
  | "OTHER";

export type SetupStep =
  | "BUSINESS_TYPE"
  | "BUSINESS_INFO"
  | "LOCATION"
  | "PAYMENT_PROVIDER"
  | "MENU_IMPORT"
  | "WEBSITE_THEME"
  | "DONE";

export interface Restaurant {
  id: string;
  ownerId: string;
  name: string;
  businessType: BusinessType;
  setupStep: SetupStep;
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  isPublished: boolean;
  isSuspended: boolean;
  suspendedReason: string | null;
  referralCode: string | null;
}

export interface RestaurantInput {
  name?: string;
  businessType?: BusinessType;
  description?: string;
  address?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  isPublished?: boolean;
  /** The *referrer's* code (from a ?ref= link) — only meaningful on creation. */
  referralCode?: string;
}

export interface ReferredRestaurant {
  id: string;
  name: string;
  isPublished: boolean;
  createdAt: string;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  isAvailable: boolean;
  sortOrder: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
}

export interface MenuItemInput {
  categoryId: string;
  name: string;
  description?: string;
  priceCents: number;
  isAvailable?: boolean;
  sortOrder?: number;
}

export type ImportSourceType =
  | "PDF"
  | "IMAGE"
  | "CSV"
  | "WEBSITE"
  | "GOOGLE_MAPS"
  | "DOORDASH"
  | "UBER_EATS"
  | "GRUBHUB";

export type ImportStatus = "PENDING" | "PROCESSING" | "AWAITING_REVIEW" | "APPROVED" | "REJECTED" | "FAILED";

export interface SocialLink {
  platform: string;
  url: string;
}

export interface BusinessProfile {
  name?: string;
  address?: string;
  phone?: string;
  website?: string;
  hours?: string[];
  logoUrl?: string;
  socialLinks?: SocialLink[];
}

export interface ExtractedMenuData {
  categories: {
    name: string;
    items: { name: string; description?: string; priceCents: number; confidence?: number }[];
  }[];
  businessProfile?: BusinessProfile;
}

export interface ImportJob {
  id: string;
  sourceType: ImportSourceType;
  status: ImportStatus;
  extractedData: ExtractedMenuData | null;
  errorMessage: string | null;
  createdAt: string;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error ?? "Request failed");
  }

  return data as T;
}

export function login(email: string, password: string, rememberMe = true) {
  return apiFetch<{ user: PublicUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, rememberMe }),
  });
}

export function register(email: string, password: string, name: string) {
  return apiFetch<{ user: PublicUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export function logout() {
  return apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export function logoutAllDevices() {
  return apiFetch<{ ok: true }>("/api/auth/logout-all", { method: "POST" });
}

export function getMe() {
  return apiFetch<{ user: PublicUser }>("/api/auth/me");
}

export function forgotPassword(email: string) {
  return apiFetch<{ ok: true }>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, newPassword: string) {
  return apiFetch<{ ok: true }>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ ok: true }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function verifyEmail(token: string) {
  return apiFetch<{ ok: true }>("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function resendVerification() {
  return apiFetch<{ ok: true }>("/api/auth/resend-verification", { method: "POST" });
}

export function updateProfile(input: { name?: string; phone?: string | null }) {
  return apiFetch<{ user: PublicUser }>("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

export function inviteStaff(email: string, password: string, name: string) {
  return apiFetch<{ user: PublicUser }>("/api/auth/staff", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export function listStaff() {
  return apiFetch<{ staff: StaffMember[] }>("/api/auth/staff");
}

export function setStaffActive(id: string, isActive: boolean) {
  return apiFetch<{ staff: StaffMember }>(`/api/auth/staff/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export function createRestaurant(input: RestaurantInput) {
  return apiFetch<{ restaurant: Restaurant }>("/api/restaurants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRestaurant(input: RestaurantInput) {
  return apiFetch<{ restaurant: Restaurant }>("/api/restaurants/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getRestaurant() {
  return apiFetch<{ restaurant: Restaurant }>("/api/restaurants/me");
}

export function setSetupStep(setupStep: SetupStep) {
  return apiFetch<{ restaurant: Restaurant }>("/api/restaurants/me/setup-step", {
    method: "PATCH",
    body: JSON.stringify({ setupStep }),
  });
}

export function listReferrals() {
  return apiFetch<{ referrals: ReferredRestaurant[] }>("/api/restaurants/me/referrals");
}

export type HoursDayOfWeek = "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY";

export interface RestaurantHoursRow {
  id: string;
  dayOfWeek: HoursDayOfWeek;
  opensAt: number;
  closesAt: number;
  isClosed: boolean;
}

export interface HoursRowInput {
  dayOfWeek: HoursDayOfWeek;
  opensAt: number;
  closesAt: number;
  isClosed: boolean;
}

export function listRestaurantHours() {
  return apiFetch<{ hours: RestaurantHoursRow[] }>("/api/restaurants/me/hours");
}

export function setRestaurantHours(hours: HoursRowInput[]) {
  return apiFetch<{ hours: RestaurantHoursRow[] }>("/api/restaurants/me/hours", {
    method: "PUT",
    body: JSON.stringify({ hours }),
  });
}

export function createCategory(name: string) {
  return apiFetch<{ category: MenuCategory }>("/api/menu/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteCategory(id: string) {
  return apiFetch<void>(`/api/menu/categories/${id}`, { method: "DELETE" });
}

export function createItem(input: MenuItemInput) {
  return apiFetch<{ item: MenuItem }>("/api/menu/items", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateItem(id: string, input: Partial<MenuItemInput>) {
  return apiFetch<{ item: MenuItem }>(`/api/menu/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteItem(id: string) {
  return apiFetch<void>(`/api/menu/items/${id}`, { method: "DELETE" });
}

// --- Variants -----------------------------------------------------------------

export interface MenuItemVariant {
  id: string;
  menuItemId: string;
  name: string;
  priceDeltaCents: number;
  sortOrder: number;
  isDefault: boolean;
}

export interface VariantInput {
  name: string;
  priceDeltaCents?: number;
  sortOrder?: number;
  isDefault?: boolean;
}

export function listVariants(itemId: string) {
  return apiFetch<{ variants: MenuItemVariant[] }>(`/api/restaurants/me/menu-items/${itemId}/variants`);
}

export function createVariant(itemId: string, input: VariantInput) {
  return apiFetch<{ variant: MenuItemVariant }>(`/api/restaurants/me/menu-items/${itemId}/variants`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateVariant(itemId: string, variantId: string, input: Partial<VariantInput>) {
  return apiFetch<{ variant: MenuItemVariant }>(`/api/restaurants/me/menu-items/${itemId}/variants/${variantId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteVariant(itemId: string, variantId: string) {
  return apiFetch<void>(`/api/restaurants/me/menu-items/${itemId}/variants/${variantId}`, { method: "DELETE" });
}

// --- Modifier groups & options --------------------------------------------------

export type ModifierSelectionType = "SINGLE" | "MULTI";

export interface ModifierOption {
  id: string;
  modifierGroupId: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
  sortOrder: number;
}

export interface ModifierGroup {
  id: string;
  restaurantId: string;
  name: string;
  selectionType: ModifierSelectionType;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number | null;
  options: ModifierOption[];
}

export interface ModifierGroupInput {
  name: string;
  selectionType: ModifierSelectionType;
  isRequired?: boolean;
  minSelections?: number;
  maxSelections?: number;
}

export interface ModifierOptionInput {
  name: string;
  priceDeltaCents?: number;
  isAvailable?: boolean;
  sortOrder?: number;
}

export function listModifierGroups() {
  return apiFetch<{ modifierGroups: ModifierGroup[] }>("/api/restaurants/me/modifier-groups");
}

export function createModifierGroup(input: ModifierGroupInput) {
  return apiFetch<{ modifierGroup: ModifierGroup }>("/api/restaurants/me/modifier-groups", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteModifierGroup(id: string) {
  return apiFetch<void>(`/api/restaurants/me/modifier-groups/${id}`, { method: "DELETE" });
}

export function createModifierOption(groupId: string, input: ModifierOptionInput) {
  return apiFetch<{ modifierOption: ModifierOption }>(`/api/restaurants/me/modifier-groups/${groupId}/options`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteModifierOption(groupId: string, optionId: string) {
  return apiFetch<void>(`/api/restaurants/me/modifier-groups/${groupId}/options/${optionId}`, { method: "DELETE" });
}

export interface MenuItemModifierGroupAttachment {
  id: string;
  menuItemId: string;
  modifierGroupId: string;
  sortOrder: number;
}

export function listItemModifierGroups(itemId: string) {
  return apiFetch<{ attachments: MenuItemModifierGroupAttachment[] }>(
    `/api/restaurants/me/menu-items/${itemId}/modifier-groups`,
  );
}

export function attachModifierGroup(itemId: string, modifierGroupId: string) {
  return apiFetch<{ ok: true }>(`/api/restaurants/me/menu-items/${itemId}/modifier-groups`, {
    method: "POST",
    body: JSON.stringify({ modifierGroupId }),
  });
}

export function detachModifierGroup(itemId: string, modifierGroupId: string) {
  return apiFetch<void>(`/api/restaurants/me/menu-items/${itemId}/modifier-groups/${modifierGroupId}`, {
    method: "DELETE",
  });
}

export async function createImportJob(
  sourceType: ImportSourceType,
  source: { file: File } | { url: string },
): Promise<{ job: ImportJob }> {
  const formData = new FormData();
  formData.append("sourceType", sourceType);
  if ("file" in source) {
    formData.append("file", source.file);
  } else {
    formData.append("sourceUrl", source.url);
  }

  const res = await fetch("/api/imports", {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error ?? "Import failed");
  }

  return data as { job: ImportJob };
}

export function approveImportJob(id: string) {
  return apiFetch<{ job: ImportJob }>(`/api/imports/${id}/approve`, { method: "POST" });
}

export function rejectImportJob(id: string) {
  return apiFetch<{ job: ImportJob }>(`/api/imports/${id}/reject`, { method: "POST" });
}

export function rerunImportJob(id: string) {
  return apiFetch<{ job: ImportJob }>(`/api/imports/${id}/rerun`, { method: "POST" });
}

export function updateImportJobData(id: string, data: ExtractedMenuData) {
  return apiFetch<{ job: ImportJob }>(`/api/imports/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// AI Website Builder (Sprint 06)
// ---------------------------------------------------------------------------

export type StyleFamily = "LUXURY" | "MODERN" | "MINIMAL";
export type SiteStatus = "DRAFT" | "PUBLISHING" | "REPUBLISHING" | "PUBLISHED" | "FAILED" | "UNPUBLISHED";
export type SiteVersionStatus = "VARIATION" | "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type GenerationStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type GenerationStage =
  | "INGEST"
  | "BRAND_ANALYSIS"
  | "THEME_SELECTION"
  | "CONTENT_GENERATION"
  | "ASSEMBLY"
  | "ASSETS"
  | "SCORING"
  | "FINALIZE";

export interface BrandPersonality {
  traditionalContemporary: number;
  casualFormal: number;
  playfulSerious: number;
  understatedBold: number;
  rusticPolished: number;
}

export interface SiteBrandProfile {
  cuisine: string;
  businessType: string;
  priceTier: number;
  personality: BrandPersonality;
  signalsUsed: string[];
  confidence: { cuisine: number; businessType: number; priceTier: number; personality: number };
}

export interface SiteSectionBlock {
  type: string;
  variant?: string;
  props: Record<string, unknown>;
  /** Section Management (Sprint 20A Task 5) — kept in the array (with its props) but skipped at render time. */
  hidden?: boolean;
}

export interface SitePage {
  slug: string;
  title: string;
  metaDescription: string;
  sections: SiteSectionBlock[];
}

// ---------------------------------------------------------------------------
// Website Customization Studio (Sprint 20A Task 5) — every field mirrors
// apps/api/src/modules/sites/types.ts's zod schemas 1:1 and is optional for
// the same reason: a definition saved before this task has none of these,
// and every renderer component falls back to a sensible default.
// ---------------------------------------------------------------------------

export type ButtonStyle = "rounded" | "pill" | "square";
export type ShadowIntensity = "none" | "soft" | "medium" | "strong";
export type PageWidth = "narrow" | "standard" | "wide" | "full";
export type ContentSpacing = "compact" | "comfortable" | "spacious";

export interface BrandSettings {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  headingFont?: string;
  bodyFont?: string;
  buttonStyle?: ButtonStyle;
  borderRadius?: number;
  shadowIntensity?: ShadowIntensity;
  pageWidth?: PageWidth;
  contentSpacing?: ContentSpacing;
}

export interface AnnouncementBar {
  enabled: boolean;
  text?: string;
  link?: string;
}

export interface HeaderSettings {
  logoPosition?: "left" | "center";
  headerLayout?: "standard" | "minimal" | "centered";
  stickyHeader?: boolean;
  announcementBar?: AnnouncementBar;
  showSearch?: boolean;
  showCart?: boolean;
  showAccount?: boolean;
  showOrderButton?: boolean;
  mobileNavStyle?: "drawer" | "bottomTabs";
}

export interface FooterSocialLink {
  platform: "instagram" | "facebook" | "tiktok" | "x" | "youtube" | "website";
  url: string;
}

export interface LegalLink {
  label: string;
  url: string;
}

export interface FooterSettings {
  description?: string;
  showContactInfo?: boolean;
  socialLinks?: FooterSocialLink[];
  legalLinks?: LegalLink[];
  showHours?: boolean;
  newsletterEnabled?: boolean;
  copyrightText?: string;
}

export interface ProductPresentation {
  categoryNavStyle?: "sticky" | "simple";
  cardLayout?: "grid" | "list";
  infoDensity?: "compact" | "detailed";
  showModifiersBadge?: boolean;
  priceStyle?: "standard" | "bold" | "minimal";
  outOfStockAppearance?: "dimmed" | "hidden" | "badge";
  addToCartStyle?: "button" | "iconButton" | "stepper";
}

export interface WebsiteSiteDefinition {
  schemaVersion: number;
  restaurantName: string;
  tagline: string;
  cuisine: string;
  businessType: string;
  styleFamily: StyleFamily;
  themeKey: string;
  themeVersion: number;
  colorSeed: string;
  typography: { display: string; body: string };
  designRationale?: string[];
  facts: {
    restaurantName: string;
    address?: string;
    phone?: string;
    hours?: string;
    hasOnlineOrdering: boolean;
    hasReservations: boolean;
  };
  brandSettings?: BrandSettings;
  header?: HeaderSettings;
  footer?: FooterSettings;
  productPresentation?: ProductPresentation;
  pages: SitePage[];
}

export interface Suggestion {
  id: string;
  dimension: "seo" | "performance" | "accessibility" | "brandConsistency" | "conversion";
  issue: string;
  impact: "high" | "medium" | "low";
  suggestion: string;
  autoFixKind?: "missingAltText" | "heroContrast" | "missingMetaDescription";
}

export interface WebsiteScore {
  id: string;
  siteVersionId: string;
  overall: number;
  seo: number;
  performance: number;
  accessibility: number;
  brandConsistency: number;
  conversion: number;
  suggestions: Suggestion[];
  measuredAt: string;
  source: "AUTO" | "MANUAL" | "PUBLISH";
}

export interface SiteVersion {
  id: string;
  siteId: string;
  versionNo: number;
  definition: WebsiteSiteDefinition;
  status: SiteVersionStatus;
  styleFamily: StyleFamily | null;
  generationBatchId: string | null;
  publishedAt: string | null;
  publishedById?: string | null;
  publishedBy?: { name: string } | null;
  createdAt: string;
  scores?: WebsiteScore[];
}

export interface WebsiteSite {
  id: string;
  restaurantId: string;
  slug: string;
  status: SiteStatus;
  themeId: string | null;
  themeVersion: number | null;
  publishedVersionId: string | null;
  brandProfile: SiteBrandProfile | null;
  settings: Record<string, unknown> | null;
}

export interface GenerationJob {
  id: string;
  siteId: string;
  batchId: string;
  stage: GenerationStage;
  status: GenerationStatus;
  error: string | null;
}

export type DomainVerificationStatus = "PENDING" | "VERIFIED" | "FAILED";
export type DomainTlsStatus = "PENDING" | "GENERATING" | "ACTIVE" | "EXPIRED" | "FAILED";
export type DomainEventType =
  | "CREATED"
  | "VERIFIED"
  | "VERIFICATION_FAILED"
  | "SSL_GENERATING"
  | "SSL_ACTIVE"
  | "SSL_FAILED"
  | "PRIMARY_CHANGED"
  | "DISCONNECTED";

export interface DnsRecordInstruction {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
}

export interface SiteDomain {
  id: string;
  hostname: string;
  type: "PLATFORM" | "CUSTOM";
  verificationStatus: DomainVerificationStatus;
  verificationToken: string;
  lastCheckedAt: string | null;
  tlsStatus: DomainTlsStatus;
  tlsExpiresAt: string | null;
  isPrimary: boolean;
  dnsRecords: DnsRecordInstruction[];
  createdAt: string;
}

export interface DomainEvent {
  id: string;
  siteId: string;
  domainId: string | null;
  hostname: string;
  type: DomainEventType;
  message: string | null;
  createdAt: string;
}

export interface ContactMessageRecord {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

export function getMySite() {
  return apiFetch<{ site: WebsiteSite; url: string; temporaryDomain: string }>("/api/sites/me");
}

export function createSite() {
  return apiFetch<{ site: WebsiteSite }>("/api/sites", { method: "POST" });
}

/** PATCH /api/sites/:id — currently only used to edit the temporary domain's slug before publishing. */
export function updateSite(siteId: string, input: { slug?: string }) {
  return apiFetch<{ site: WebsiteSite }>(`/api/sites/${siteId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function startGeneration(siteId: string) {
  return apiFetch<{ job: GenerationJob }>(`/api/sites/${siteId}/generate`, { method: "POST" });
}

export function getGenerationStatus(siteId: string) {
  return apiFetch<{ job: GenerationJob | null }>(`/api/sites/${siteId}/generation`);
}

export function listVariations(siteId: string) {
  return apiFetch<{ variations: SiteVersion[] }>(`/api/sites/${siteId}/variations`);
}

export function selectVariation(siteId: string, versionId: string) {
  return apiFetch<{ version: SiteVersion }>(`/api/sites/${siteId}/variations/${versionId}/select`, { method: "POST" });
}

export function regenerateVariations(siteId: string) {
  return apiFetch<{ job: GenerationJob }>(`/api/sites/${siteId}/variations/regenerate`, { method: "POST" });
}

export function listSiteVersions(siteId: string) {
  return apiFetch<{ versions: SiteVersion[] }>(`/api/sites/${siteId}/versions`);
}

export function getSiteVersion(siteId: string, versionId: string) {
  return apiFetch<{ version: SiteVersion }>(`/api/sites/${siteId}/versions/${versionId}`);
}

export function patchDraft(siteId: string, patch: Partial<WebsiteSiteDefinition>) {
  return apiFetch<{ version: SiteVersion }>(`/api/sites/${siteId}/draft`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Customization Studio live preview (Sprint 20A Task 5) — renders an unsaved candidate definition with the real renderer; never persists it. */
export function renderDraftPreview(siteId: string, definition: WebsiteSiteDefinition, path = "/") {
  return apiFetch<{ html: string }>(`/api/sites/${siteId}/draft/render`, {
    method: "POST",
    body: JSON.stringify({ definition, path }),
  });
}

export type SiteAssetKind = "HERO" | "HERO_BACKGROUND" | "GALLERY" | "LOGO" | "FAVICON" | "OG";

export interface SiteAssetRenditions {
  thumbnail?: string;
  card?: string;
  full?: string;
}

export interface SiteAsset {
  id: string;
  siteId: string;
  kind: SiteAssetKind;
  storageKey: string;
  renditions: SiteAssetRenditions | null;
  altText: string | null;
  sortOrder: number;
  url: string;
}

export function listSiteAssets(siteId: string) {
  return apiFetch<{ assets: SiteAsset[] }>(`/api/sites/${siteId}/assets`);
}

/** Bypasses apiFetch's forced JSON Content-Type — multipart needs the browser to set its own boundary, same pattern as createImportJob above. */
export async function uploadSiteAsset(siteId: string, kind: SiteAssetKind, file: File): Promise<{ asset: SiteAsset }> {
  const formData = new FormData();
  formData.append("kind", kind);
  formData.append("file", file);

  const res = await fetch(`/api/sites/${siteId}/assets`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "Upload failed");
  }
  return data as { asset: SiteAsset };
}

export function updateSiteAsset(siteId: string, assetId: string, patch: { altText?: string; sortOrder?: number }) {
  return apiFetch<{ asset: SiteAsset }>(`/api/sites/${siteId}/assets/${assetId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function removeSiteAsset(siteId: string, assetId: string) {
  return apiFetch<void>(`/api/sites/${siteId}/assets/${assetId}`, { method: "DELETE" });
}

export function getLatestScore(siteId: string, versionId: string) {
  return apiFetch<{ score: WebsiteScore | null }>(`/api/sites/${siteId}/versions/${versionId}/score`);
}

export function runScore(siteId: string, versionId: string) {
  return apiFetch<{ score: WebsiteScore }>(`/api/sites/${siteId}/versions/${versionId}/score`, { method: "POST" });
}

export function applySuggestion(siteId: string, versionId: string, suggestion: Suggestion) {
  return apiFetch<{ score: WebsiteScore }>(`/api/sites/${siteId}/versions/${versionId}/suggestions/apply`, {
    method: "POST",
    body: JSON.stringify(suggestion),
  });
}

export interface PublishIssue {
  code: "BUSINESS_NAME" | "THEME_SELECTED" | "WEBSITE_CONTENT" | "REQUIRED_PAGES" | "MENU" | "NAVIGATION" | "ASSETS";
  message: string;
}

export interface PublishReadiness {
  ready: boolean;
  issues: PublishIssue[];
}

/** GET /api/sites/:id/publish-check — read-only validation the Studio's staged publish flow runs before starting. */
export function checkPublishReadiness(siteId: string) {
  return apiFetch<PublishReadiness>(`/api/sites/${siteId}/publish-check`);
}

export function publishSite(siteId: string) {
  return apiFetch<{ version: SiteVersion; scoreDelta?: number; warning?: string }>(`/api/sites/${siteId}/publish`, {
    method: "POST",
  });
}

export function listReleases(siteId: string) {
  return apiFetch<{ releases: SiteVersion[] }>(`/api/sites/${siteId}/releases`);
}

export function rollbackSite(siteId: string, versionId: string) {
  return apiFetch<{ site: WebsiteSite }>(`/api/sites/${siteId}/rollback/${versionId}`, { method: "POST" });
}

export function unpublishSite(siteId: string) {
  return apiFetch<{ site: WebsiteSite }>(`/api/sites/${siteId}/unpublish`, { method: "POST" });
}

export function listDomains(siteId: string) {
  return apiFetch<{ domains: SiteDomain[] }>(`/api/sites/${siteId}/domains`);
}

export function addDomain(siteId: string, hostname: string) {
  return apiFetch<{ domain: SiteDomain }>(`/api/sites/${siteId}/domains`, {
    method: "POST",
    body: JSON.stringify({ hostname }),
  });
}

export function verifyDomain(siteId: string, domainId: string) {
  return apiFetch<{ domain: SiteDomain }>(`/api/sites/${siteId}/domains/${domainId}/verify`, { method: "POST" });
}

export function setPrimaryDomain(siteId: string, domainId: string) {
  return apiFetch<{ domain: SiteDomain }>(`/api/sites/${siteId}/domains/${domainId}/primary`, { method: "POST" });
}

export function removeDomain(siteId: string, domainId: string) {
  return apiFetch<void>(`/api/sites/${siteId}/domains/${domainId}`, { method: "DELETE" });
}

/** GET /api/sites/:id/domain-history — full domain lifecycle timeline (Sprint 20A Task 4), survives individual domains being disconnected. */
export function listDomainHistory(siteId: string) {
  return apiFetch<{ events: DomainEvent[] }>(`/api/sites/${siteId}/domain-history`);
}

export function listMessages(siteId: string) {
  return apiFetch<{ messages: ContactMessageRecord[] }>(`/api/sites/${siteId}/messages`);
}

/** §18 Preview System — a short-lived, site-scoped token for building a /preview/:token URL (proxied by next.config.ts). */
export function getPreviewToken(siteId: string) {
  return apiFetch<{ token: string }>(`/api/sites/${siteId}/preview-token`);
}

// --- Platform admin (Sprint 16) ------------------------------------------------

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: unknown;
  createdAt: string;
  adminName: string;
}

export function suspendRestaurant(id: string, reason?: string) {
  return apiFetch<{ restaurant: Restaurant }>(`/api/admin/restaurants/${id}/suspend`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
}

export function unsuspendRestaurant(id: string) {
  return apiFetch<{ restaurant: Restaurant }>(`/api/admin/restaurants/${id}/unsuspend`, { method: "PATCH" });
}

export function listAuditLog(limit = 50) {
  return apiFetch<{ entries: AuditLogEntry[] }>(`/api/admin/audit-log?limit=${limit}`);
}
