import { afterEach, describe, expect, it, vi } from "vitest";
import { testCredential } from "../packages/core/src/credentials/credentials";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = handler as typeof fetch;
}

describe("testCredential", () => {
  it("returns ok:false for empty value", async () => {
    const result = await testCredential("anthropic", "");
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("empty value");
  });

  it("reports ok:true for Anthropic 200 response", async () => {
    mockFetch(async () => new Response(JSON.stringify({}), { status: 200 }));
    const result = await testCredential("anthropic", "sk-ant-test-key");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("treats Anthropic 400 (model rejected) as key-accepted", async () => {
    mockFetch(async () => new Response("bad model", { status: 400 }));
    const result = await testCredential("anthropic", "sk-ant-test-key");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(400);
  });

  it("reports ok:false for Anthropic 401", async () => {
    mockFetch(async () => new Response("unauthorized", { status: 401 }));
    const result = await testCredential("anthropic", "sk-ant-bad-key");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it("reports ok:true for OpenAI 200 response", async () => {
    mockFetch(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const result = await testCredential("openai", "sk-test");
    expect(result.ok).toBe(true);
  });

  it("reports ok:false for OpenAI 401", async () => {
    mockFetch(async () => new Response("unauthorized", { status: 401 }));
    const result = await testCredential("openai", "sk-bad");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it("reports ok:true for Ollama 200 response", async () => {
    mockFetch(async () => new Response(JSON.stringify({ models: [] }), { status: 200 }));
    const result = await testCredential("ollama", "http://localhost:11434");
    expect(result.ok).toBe(true);
  });

  it("reports ok:false when Ollama is unreachable", async () => {
    mockFetch(async () => { throw new Error("connect ECONNREFUSED"); });
    const result = await testCredential("ollama", "http://localhost:11434");
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("ECONNREFUSED");
  });

  it("strips trailing slashes from Ollama base URL", async () => {
    let observedUrl = "";
    mockFetch(async (input) => {
      observedUrl = typeof input === "string" ? input : input.toString();
      return new Response(JSON.stringify({}), { status: 200 });
    });
    await testCredential("ollama", "http://localhost:11434///");
    expect(observedUrl).toBe("http://localhost:11434/api/tags");
  });
});
