import { describe, expect, it } from "vitest";
import { renderInternalLinkBaseScript, resolveStoreBasePath } from "./chrome";

describe("resolveStoreBasePath", () => {
  it("extracts the /store/<slug> base from a fallback-served path", () => {
    expect(resolveStoreBasePath("/store/joes-diner")).toBe("/store/joes-diner");
    expect(resolveStoreBasePath("/store/joes-diner/menu")).toBe("/store/joes-diner");
    expect(resolveStoreBasePath("/store/joes-diner/gallery/2")).toBe("/store/joes-diner");
  });

  it("returns '' for the real subdomain/root serving case", () => {
    expect(resolveStoreBasePath("/")).toBe("");
    expect(resolveStoreBasePath("/menu")).toBe("");
    expect(resolveStoreBasePath("/about")).toBe("");
  });
});

/**
 * Runs the inline base-path script against a minimal fake DOM (the api test
 * env is node, not jsdom) to prove the actual link-rewriting behavior — not
 * just that the script string exists.
 */
function runBaseScript(pathname: string, hrefs: string[]): string[] {
  const body = renderInternalLinkBaseScript()
    .replace(/^<script>/, "")
    .replace(/<\/script>$/, "");

  const links = hrefs.map((initial) => {
    let current = initial;
    return {
      getAttribute: () => current,
      setAttribute: (_name: string, value: string) => {
        current = value;
      },
      read: () => current,
    };
  });

  const fakeLocation = { pathname };
  const fakeDocument = {
    // Mirror the `a[href^="/"]` selector: only root-relative anchors match.
    querySelectorAll: () => links.filter((l) => l.getAttribute().startsWith("/")),
  };

  const fn = new Function("location", "document", body);
  fn(fakeLocation, fakeDocument);
  return links.map((l) => l.read());
}

describe("renderInternalLinkBaseScript — fixes root-relative nav under the /store/<slug> base", () => {
  it("prefixes internal page links (nav, home, category, footer) with the /store base", () => {
    const [home, menu, about, category] = runBaseScript("/store/joes-diner/menu", [
      "/",
      "/menu",
      "/about",
      "/menu#mains",
    ]);
    expect(home).toBe("/store/joes-diner/");
    expect(menu).toBe("/store/joes-diner/menu");
    expect(about).toBe("/store/joes-diner/about");
    expect(category).toBe("/store/joes-diner/menu#mains");
  });

  it("leaves infrastructure and protocol-relative links untouched", () => {
    const [asset, api, preview, protoRel] = runBaseScript("/store/joes-diner", [
      "/assets/hero.jpg",
      "/api/whatever",
      "/preview/tok",
      "//evil.example/x",
    ]);
    expect(asset).toBe("/assets/hero.jpg");
    expect(api).toBe("/api/whatever");
    expect(preview).toBe("/preview/tok");
    expect(protoRel).toBe("//evil.example/x");
  });

  it("is a no-op on the real subdomain/root (no /store base) — links unchanged", () => {
    const [home, menu] = runBaseScript("/menu", ["/", "/menu"]);
    expect(home).toBe("/");
    expect(menu).toBe("/menu");
  });
});
