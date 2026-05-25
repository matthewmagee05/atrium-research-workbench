import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";
import { findNonAsciiChar } from "@research-workbench/core";

const PROVIDERS = ["anthropic", "openai", "ollama"] as const;
export type Provider = typeof PROVIDERS[number];

function envVarName(provider: Provider): string {
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "openai") return "OPENAI_API_KEY";
  return "OLLAMA_BASE_URL";
}

function storePath(): string {
  return path.join(app.getPath("userData"), "atrium-credentials.json");
}

type StoreShape = Partial<Record<Provider, string>>;

function readStore(): StoreShape {
  const p = storePath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as StoreShape;
  } catch {
    return {};
  }
}

function writeStore(store: StoreShape): void {
  const p = storePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function isCredentialStoreAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function desktopSetCredential(provider: Provider, value: string): void {
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`Unknown credential provider: ${provider}`);
  }
  if (!isCredentialStoreAvailable()) {
    throw new Error(
      "OS encryption is unavailable. On Linux, install libsecret-1-dev and a keychain (gnome-keyring or KWallet). " +
      "On macOS and Windows this should work out of the box — re-launch the app and try again."
    );
  }
  const store = readStore();
  if (value === "") {
    delete store[provider];
    delete process.env[envVarName(provider)];
  } else {
    const offending = findNonAsciiChar(value);
    if (offending) {
      throw new Error(
        `Cannot save: value contains a non-ASCII character "${offending.char}" (U+${offending.code.toString(16).toUpperCase().padStart(4, "0")}) at position ${offending.index}. ` +
        `This usually means autocorrect or smart-quote substitution corrupted the paste. ` +
        `Click "Fix" in the dialog or retype the value, then try again.`
      );
    }
    const encrypted = safeStorage.encryptString(value);
    store[provider] = encrypted.toString("base64");
    process.env[envVarName(provider)] = value;
  }
  writeStore(store);
}

export function desktopGetCredential(provider: Provider): string | null {
  if (!isCredentialStoreAvailable()) return null;
  const store = readStore();
  const blob = store[provider];
  if (!blob) return null;
  try {
    return safeStorage.decryptString(Buffer.from(blob, "base64"));
  } catch {
    return null;
  }
}

export function desktopGetCredentialStatus(): Record<Provider, boolean> {
  const result: Record<Provider, boolean> = { anthropic: false, openai: false, ollama: false };
  if (!isCredentialStoreAvailable()) return result;
  const store = readStore();
  for (const provider of PROVIDERS) {
    const blob = store[provider];
    if (!blob) continue;
    try {
      const value = safeStorage.decryptString(Buffer.from(blob, "base64"));
      result[provider] = Boolean(value && value.length > 0);
    } catch {
      result[provider] = false;
    }
  }
  return result;
}

export function loadCredentialsIntoEnv(): void {
  if (!isCredentialStoreAvailable()) return;
  for (const provider of PROVIDERS) {
    const value = desktopGetCredential(provider);
    if (value) {
      process.env[envVarName(provider)] = value;
    }
  }
}
