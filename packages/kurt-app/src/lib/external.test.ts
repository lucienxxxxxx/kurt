import { afterEach, describe, expect, test } from "vitest";
import { isExternalHref, externalLinkFromClick } from "./external.ts";

afterEach(() => { document.body.innerHTML = ""; });

describe("isExternalHref", () => {
  test("true for http/https/mailto (case-insensitive, trimmed)", () => {
    expect(isExternalHref("https://example.com")).toBe(true);
    expect(isExternalHref("http://example.com/x")).toBe(true);
    expect(isExternalHref("HTTPS://EXAMPLE.com")).toBe(true);
    expect(isExternalHref("  https://example.com  ")).toBe(true);
    expect(isExternalHref("mailto:a@b.com")).toBe(true);
  });

  test("false for in-app / non-web hrefs", () => {
    expect(isExternalHref("#section")).toBe(false);
    expect(isExternalHref("/local/path")).toBe(false);
    expect(isExternalHref("javascript:alert(1)")).toBe(false);
    expect(isExternalHref("ftp://host/file")).toBe(false);
    expect(isExternalHref("")).toBe(false);
  });
});

describe("externalLinkFromClick", () => {
  function clickOn(el: Element): MouseEvent {
    return { defaultPrevented: false, target: el } as unknown as MouseEvent;
  }

  test("returns the href when clicking inside an external link", () => {
    const a = document.createElement("a");
    a.setAttribute("href", "https://example.com/");
    const span = document.createElement("span");
    a.appendChild(span);
    document.body.appendChild(a);
    expect(externalLinkFromClick(clickOn(span))).toBe("https://example.com/");
    expect(externalLinkFromClick(clickOn(a))).toBe("https://example.com/");
  });

  test("null for an in-app anchor, a non-anchor target, or an already-handled event", () => {
    const inApp = document.createElement("a");
    inApp.setAttribute("href", "#top");
    document.body.appendChild(inApp);
    expect(externalLinkFromClick(clickOn(inApp))).toBeNull();

    const div = document.createElement("div");
    document.body.appendChild(div);
    expect(externalLinkFromClick(clickOn(div))).toBeNull();

    const ext = document.createElement("a");
    ext.setAttribute("href", "https://example.com/");
    document.body.appendChild(ext);
    expect(externalLinkFromClick({ defaultPrevented: true, target: ext } as unknown as MouseEvent)).toBeNull();
  });
});
