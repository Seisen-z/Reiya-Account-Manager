// Signs a release installer for the in-app updater.
// Usage: UPDATE_SIGNING_KEY=<base64 ed25519 seed> node scripts/sign-update.cjs <installer.exe>
// Writes <installer.exe>.sig. The app verifies it against the public key embedded in
// src-tauri/src/lib.rs (UPDATE_PUBLIC_KEY) and refuses to run an installer that fails.
const crypto = require("crypto");
const fs = require("fs");

const file = process.argv[2];
const seedB64 = (process.env.UPDATE_SIGNING_KEY || "").trim();
if (!file || !seedB64) {
  console.error("Usage: UPDATE_SIGNING_KEY=<base64 seed> node scripts/sign-update.cjs <file>");
  process.exit(1);
}
const seed = Buffer.from(seedB64, "base64");
if (seed.length !== 32) {
  console.error("UPDATE_SIGNING_KEY must be a base64-encoded 32-byte ed25519 seed.");
  process.exit(1);
}

const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
const key = crypto.createPrivateKey({ key: Buffer.concat([pkcs8Prefix, seed]), format: "der", type: "pkcs8" });
const digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest();
const message = Buffer.concat([Buffer.from("reiya-update-v1:"), digest]);
fs.writeFileSync(file + ".sig", crypto.sign(null, message, key).toString("base64"));
console.log("Signed " + file);
