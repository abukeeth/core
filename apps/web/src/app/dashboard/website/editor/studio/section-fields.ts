export type FieldKind = "text" | "textarea" | "boolean" | "select" | "number" | "url" | "list";

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  options?: SelectOption[];
  placeholder?: string;
  itemFields?: FieldDef[];
  min?: number;
  max?: number;
  step?: number;
}

export const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  signatureDishes: "Signature Dishes",
  featuredCategories: "Featured Categories",
  featuredProducts: "Featured Products",
  bestSellers: "Best Sellers",
  offers: "Offers",
  aboutTeaser: "About (teaser)",
  aboutStory: "About (full story)",
  hoursLocation: "Hours & Location",
  reviews: "Reviews",
  gallery: "Gallery",
  loyalty: "Loyalty",
  appPromotion: "App Promotion",
  ctaBanner: "Call to Action",
  menu: "Menu",
  contactInfo: "Contact Info",
  contactForm: "Contact Form",
  newsletter: "Newsletter",
  customTextImage: "Custom Text & Image",
  footer: "Footer",
};

/** Section types an owner can add fresh via "Add Section" — excludes menu/contactForm/footer (one-per-site, already present) and signatureDishes (AI-curated, not hand-built). */
export const ADDABLE_SECTION_TYPES = [
  "hero",
  "featuredCategories",
  "featuredProducts",
  "bestSellers",
  "offers",
  "aboutTeaser",
  "aboutStory",
  "hoursLocation",
  "reviews",
  "gallery",
  "loyalty",
  "appPromotion",
  "ctaBanner",
  "contactInfo",
  "newsletter",
  "customTextImage",
];

const ALIGNMENT_OPTIONS: SelectOption[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const HEIGHT_OPTIONS: SelectOption[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "full", label: "Full screen" },
];

/**
 * Editable props per section type, mirroring exactly what each renderer
 * (apps/api/.../renderer/components/*.ts) reads off `section.props` — kept
 * in lockstep with those files intentionally, so nothing in this list is
 * ever a control disconnected from the real storefront. Section types with
 * no entry (menu, contactForm) have no owner-editable props of their own —
 * their content is live commerce data or has no text prop to edit.
 */
export const SECTION_FIELD_DEFS: Record<string, FieldDef[]> = {
  hero: [
    { key: "headline", label: "Headline", kind: "text" },
    { key: "subhead", label: "Supporting text", kind: "textarea" },
    { key: "badge", label: "Badge / promo message", kind: "text" },
    { key: "ctaLabel", label: "Primary button label", kind: "text" },
    { key: "ctaLink", label: "Primary button link", kind: "text", placeholder: "#primary-action" },
    { key: "secondaryCtaLabel", label: "Secondary button label", kind: "text" },
    { key: "secondaryCtaLink", label: "Secondary button link", kind: "text", placeholder: "/menu" },
    { key: "alignment", label: "Text alignment", kind: "select", options: ALIGNMENT_OPTIONS },
    { key: "height", label: "Section height", kind: "select", options: HEIGHT_OPTIONS },
    { key: "overlayOpacity", label: "Image overlay darkness", kind: "number", min: 0, max: 1, step: 0.05 },
  ],
  signatureDishes: [{ key: "intro", label: "Intro text", kind: "textarea" }],
  featuredCategories: [
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle", kind: "textarea" },
    { key: "limit", label: "Categories to show", kind: "number", min: 1, max: 12 },
  ],
  featuredProducts: [
    { key: "title", label: "Title", kind: "text" },
    { key: "subtitle", label: "Subtitle", kind: "textarea" },
    { key: "productSource", label: "Product source (category name, or leave blank for all)", kind: "text" },
    { key: "limit", label: "Products to show", kind: "number", min: 1, max: 24 },
    {
      key: "cardLayout",
      label: "Card layout",
      kind: "select",
      options: [
        { value: "grid", label: "Grid" },
        { value: "list", label: "List" },
      ],
    },
    { key: "showPrice", label: "Show price", kind: "boolean" },
    { key: "showDescriptions", label: "Show descriptions", kind: "boolean" },
    { key: "showOrderButtons", label: "Show order buttons", kind: "boolean" },
  ],
  bestSellers: [
    { key: "title", label: "Title", kind: "text" },
    { key: "limit", label: "Items to show", kind: "number", min: 1, max: 12 },
  ],
  offers: [{ key: "title", label: "Title", kind: "text" }],
  aboutTeaser: [{ key: "excerpt", label: "Excerpt", kind: "textarea" }],
  aboutStory: [{ key: "story", label: "Story", kind: "textarea" }],
  hoursLocation: [
    { key: "address", label: "Address override", kind: "text" },
    { key: "phone", label: "Phone override", kind: "text" },
  ],
  reviews: [
    { key: "title", label: "Title", kind: "text" },
    {
      key: "layout",
      label: "Layout",
      kind: "select",
      options: [
        { value: "grid", label: "Grid" },
        { value: "list", label: "List" },
      ],
    },
    { key: "showRating", label: "Show star rating", kind: "boolean" },
    { key: "showPhotos", label: "Show customer photos", kind: "boolean" },
    {
      key: "reviews",
      label: "Reviews",
      kind: "list",
      itemFields: [
        { key: "author", label: "Name", kind: "text" },
        { key: "quote", label: "Quote", kind: "textarea" },
        { key: "rating", label: "Rating (1-5)", kind: "number", min: 1, max: 5 },
        { key: "photoUrl", label: "Photo URL", kind: "url" },
      ],
    },
  ],
  gallery: [{ key: "intro", label: "Intro text", kind: "textarea" }],
  loyalty: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
  ],
  appPromotion: [
    { key: "headline", label: "Headline", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "iosUrl", label: "iOS App Store link", kind: "url" },
    { key: "androidUrl", label: "Google Play link", kind: "url" },
  ],
  ctaBanner: [{ key: "label", label: "Button label", kind: "text" }],
  contactInfo: [
    { key: "address", label: "Address override", kind: "text" },
    { key: "phone", label: "Phone override", kind: "text" },
  ],
  newsletter: [
    { key: "title", label: "Title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
  ],
  customTextImage: [
    { key: "heading", label: "Heading", kind: "text" },
    { key: "body", label: "Body text", kind: "textarea" },
    { key: "galleryImageIndex", label: "Gallery photo # (0 = first uploaded)", kind: "number", min: 0, max: 50 },
    {
      key: "imagePosition",
      label: "Image position",
      kind: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
      ],
    },
  ],
  footer: [{ key: "restaurantName", label: "Business name override", kind: "text" }],
};
