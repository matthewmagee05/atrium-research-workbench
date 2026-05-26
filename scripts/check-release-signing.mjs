const target = process.argv[2];

const REQUIRED = {
  mac: [
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
  ],
  win: [
    "WIN_CSC_LINK",
    "WIN_CSC_KEY_PASSWORD",
  ],
  linux: [],
};

if (!target || !(target in REQUIRED)) {
  console.error("Usage: node scripts/check-release-signing.mjs <mac|win|linux>");
  process.exit(2);
}

const missing = REQUIRED[target].filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Production ${target} release signing is not configured. Missing: ${missing.join(", ")}`);
  console.error("Configure the missing repository secrets or run electron-builder locally for an unsigned development build.");
  process.exit(1);
}

console.log(target === "linux" ? "Linux release does not require code-signing secrets." : `${target} release signing secrets are present.`);
