import { afterEach, describe, expect, it, vi } from "vitest";
import { findNonAsciiChar, sanitizeCredentialPaste, testCredential } from "../packages/core/src/credentials/credentials";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("findNonAsciiChar", () => {
  it("returns null for pure ASCII keys", () => {
    expect(findNonAsciiChar("sk-ant-api03-AbCdEf-0123_-")).toBeNull();
  });

  it("flags em-dash (U+2014) the way fetch would", () => {
    const v = "sk—ant—api03";
    const r = findNonAsciiChar(v);
    expect(r).not.toBeNull();
    expect(r!.code).toBe(0x2014);
    expect(r!.index).toBe(2);
  });

  it("flags smart quote (U+2019)", () => {
    const r = findNonAsciiChar("foo’bar");
    expect(r?.code).toBe(0x2019);
  });

  it("flags non-breaking space (U+00A0)", () => {
    const r = findNonAsciiChar("foo bar");
    expect(r?.code).toBe(0x00A0);
  });
});

describe("sanitizeCredentialPaste", () => {
  it("replaces em-dash with ASCII hyphen", () => {
    const { cleaned, replaced } = sanitizeCredentialPaste("sk—ant—api");
    expect(cleaned).toBe("sk-ant-api");
    expect(replaced).toBe(2);
  });

  it("replaces curly quotes with straight quotes", () => {
    const { cleaned, replaced } = sanitizeCredentialPaste("“foo” ‘bar’");
    expect(cleaned).toBe('"foo" \'bar\'');
    expect(replaced).toBe(4);
  });

  it("strips zero-width chars and BOM", () => {
    const { cleaned, replaced } = sanitizeCredentialPaste("foo​bar﻿");
    expect(cleaned).toBe("foobar");
    expect(replaced).toBe(2);
  });

  it("leaves clean ASCII unchanged", () => {
    const { cleaned, replaced } = sanitizeCredentialPaste("sk-proj-AbCdEf");
    expect(cleaned).toBe("sk-proj-AbCdEf");
    expect(replaced).toBe(0);
  });
});

describe("testCredential rejects non-ASCII before calling fetch", () => {
  it("returns a friendly error and does NOT hit the network", async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async () => { fetchCalls += 1; return new Response("", { status: 200 }); }) as typeof fetch;
    const result = await testCredential("openai", "sk—proj—abc");
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("non-ASCII");
    expect(result.detail).toContain("U+2014");
    expect(fetchCalls).toBe(0);
  });

  it("still calls fetch for clean ASCII keys", async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async () => { fetchCalls += 1; return new Response("", { status: 200 }); }) as typeof fetch;
    const result = await testCredential("openai", "sk-clean-ascii-key");
    expect(fetchCalls).toBe(1);
    expect(result.ok).toBe(true);
  });
});
