// Verifies release installers without access to the private signing key.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

async function verifyInstaller() {
  const installer = process.argv[2];
  if (!installer) throw new Error("Usage: node scripts/verify-update.cjs <installer.exe>");

  const updater = fs.readFileSync(path.join(__dirname, "../src-tauri/src/updater.rs"), "utf8");
  const keyDefinition = updater.match(/const UPDATE_PUBLIC_KEY:\s*\[u8;\s*32\]\s*=\s*\[([^\]]+)\]/);
  const octets = keyDefinition?.[1].match(/0x[0-9a-f]{2}/gi) ?? [];
  const context = updater.match(/const UPDATE_SIGNING_CONTEXT:\s*&\[u8\]\s*=\s*b"([^"]+)"/)?.[1];
  if (octets.length !== 32 || !context) throw new Error("Could not read updater signing configuration");

  const rawKey = Buffer.from(octets.map(octet => Number.parseInt(octet, 16)));
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const key = crypto.createPublicKey({ key: Buffer.concat([spkiPrefix, rawKey]), format: "der", type: "spki" });
  const hash = crypto.createHash("sha256");
  for await (const bytes of fs.createReadStream(installer)) hash.update(bytes);
  const message = Buffer.concat([Buffer.from(context), hash.digest()]);
  const signature = Buffer.from(fs.readFileSync(installer + ".sig", "utf8").trim(), "base64");
  if (signature.length !== 64 || !crypto.verify(null, message, key, signature)) {
    throw new Error("Installer signature did not match Reiya's public key");
  }
  console.log("Verified " + installer);
}

verifyInstaller().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
