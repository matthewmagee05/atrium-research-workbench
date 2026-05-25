export type CredentialProvider = "anthropic" | "ollama" | "openai";

export async function getCredential(provider: CredentialProvider): Promise<string | null> {
  const envName =
    provider === "anthropic" ? "ANTHROPIC_API_KEY" :
    provider === "openai" ? "OPENAI_API_KEY" :
    "OLLAMA_BASE_URL";
  if (process.env[envName]) {
    return process.env[envName] as string;
  }
  try {
    const keytar = await import("keytar");
    return await keytar.getPassword("research-workbench", provider);
  } catch {
    return null;
  }
}

export async function setCredential(provider: CredentialProvider, value: string): Promise<void> {
  try {
    const keytar = await import("keytar");
    await keytar.setPassword("research-workbench", provider, value);
  } catch {
    throw new Error("OS keychain access is unavailable; refusing to persist credentials in plaintext");
  }
}

export async function getCredentialStatus(): Promise<Record<CredentialProvider, boolean>> {
  const result: Record<CredentialProvider, boolean> = { anthropic: false, openai: false, ollama: false };
  for (const provider of ["anthropic", "openai", "ollama"] as CredentialProvider[]) {
    const value = await getCredential(provider);
    result[provider] = Boolean(value && value.length > 0);
  }
  return result;
}

export interface CredentialTestResult {
  ok: boolean;
  status?: number;
  detail?: string;
}

/**
 * Returns the first non-ASCII character offending an HTTP header value, or null if clean.
 * HTTP headers are restricted to ISO-8859-1 (bytes 0-255). API keys themselves must be
 * plain ASCII — any em-dash, smart quote, or non-breaking space is almost always a paste
 * artifact from autocorrected source text.
 */
export function findNonAsciiChar(value: string): { index: number; char: string; code: number } | null {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 127) {
      return { index: i, char: value[i], code };
    }
  }
  return null;
}

const COMMON_AUTOCORRECT_REPLACEMENTS: Record<string, string> = {
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", // hyphens / dashes
  "‘": "'", "’": "'", "‚": "'", "‛": "'",                                // single quotes
  "“": "\"", "”": "\"", "„": "\"", "‟": "\"",                            // double quotes
  " ": " ", " ": " ", " ": " ", "​": "", "‌": "", "‍": "",     // spaces / zero-width
  "﻿": "",                                                                              // BOM
};

/**
 * Replace common autocorrect artifacts (smart quotes, em-dash, non-breaking space) with
 * their ASCII equivalents. Returns the cleaned string and the count of replacements.
 */
export function sanitizeCredentialPaste(value: string): { cleaned: string; replaced: number } {
  let replaced = 0;
  const cleaned = value.replace(/./gsu, (ch) => {
    const sub = COMMON_AUTOCORRECT_REPLACEMENTS[ch];
    if (sub !== undefined) {
      replaced += 1;
      return sub;
    }
    return ch;
  });
  return { cleaned, replaced };
}

export async function testCredential(provider: CredentialProvider, value: string): Promise<CredentialTestResult> {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, detail: "Empty value." };
  }
  const offending = findNonAsciiChar(trimmed);
  if (offending) {
    return {
      ok: false,
      detail: `Value contains a non-ASCII character "${offending.char}" (U+${offending.code.toString(16).toUpperCase().padStart(4, "0")}) at position ${offending.index}. API keys must be plain ASCII — autocorrected dashes or smart quotes are a common cause. Try retyping the value or pasting from a plain-text source.`,
    };
  }
  try {
    if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": trimmed,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (response.status === 200) return { ok: true, status: 200 };
      if (response.status === 400) return { ok: true, status: 400, detail: "key accepted (model/payload rejected)" };
      const body = await response.text();
      return { ok: false, status: response.status, detail: body.slice(0, 200) };
    }
    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { authorization: `Bearer ${trimmed}` },
      });
      if (response.status === 200) return { ok: true, status: 200 };
      const body = await response.text();
      return { ok: false, status: response.status, detail: body.slice(0, 200) };
    }
    const baseUrl = trimmed.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/api/tags`, { method: "GET" });
    if (response.status === 200) return { ok: true, status: 200 };
    return { ok: false, status: response.status, detail: `unexpected status from ${baseUrl}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export function scrubSecrets(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_\-]+/g, "[REDACTED_ANTHROPIC_KEY]")
    .replace(/sk-[A-Za-z0-9_\-]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/(api[_-]?key|secret|token)(\s*[:=]\s*)['"]?[A-Za-z0-9_\-]{12,}/gi, "$1$2[REDACTED]");
}
