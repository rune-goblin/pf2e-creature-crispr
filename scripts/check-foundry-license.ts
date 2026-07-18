// Advisory preflight for the e2e harness: report whether the cloned license will pass Foundry's
// offline check *before* the boot stalls on a license screen. Foundry verifies an RSA signature
// over {host, license, version} where host is os.hostname() at boot — so a Mac whose hostname
// drifts under DHCP (observed 2026-07-19: `Marks-MacBook-Pro.local` → `<uuid>.fritz.box`) fails
// verification with a misleading "confirm your license" screen although the license is fine.
// Always exits 0: the per-boot remedy (re-sign via the /license page) needs the server running,
// so this only diagnoses; the Playwright join fixture is the hard gate.
import { existsSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { createPublicKey, createVerify, type KeyObject } from 'node:crypto';

const [foundryApp, testData] = process.argv.slice(2);
if (!foundryApp || !testData) {
  console.error('usage: node scripts/check-foundry-license.ts <foundry-app-dir> <test-data-dir>');
  process.exit(2);
}

const port = process.env.TEST_FOUNDRY_PORT ?? '30005';

function skip(reason: string): never {
  console.warn(`⚠️  license preflight inconclusive: ${reason}`);
  process.exit(0);
}

const licensePath = join(testData, 'Config', 'license.json');
if (!existsSync(licensePath)) skip(`no ${licensePath}`);
let lic: { host?: string; license?: string; version?: string; signature?: string };
try {
  lic = JSON.parse(readFileSync(licensePath, 'utf8'));
} catch {
  skip('license.json unreadable');
}
if (!lic.license || !lic.signature) skip('license has no signature yet — Foundry will prompt for it');

const licenseMjs = join(foundryApp, 'dist', 'core', 'license.mjs');
if (!existsSync(licenseMjs)) skip(`no ${licenseMjs} to read the verification key from`);
const keyPem = readFileSync(licenseMjs, 'utf8').match(
  /"(-----BEGIN PUBLIC KEY-----[\s\S]*?END PUBLIC KEY-----)"/
)?.[1];
if (!keyPem) skip('verification key not found in license.mjs');
let publicKey: KeyObject;
try {
  publicKey = createPublicKey(keyPem.replace(/\\n/g, '\n'));
} catch {
  skip('verification key unparsable');
}

// Mirrors License#currentKey; Foundry's service id is os.hostname() ASCII-sanitized (config.mjs).
const currentHost = hostname().replace(/[^\x00-\x7F]/g, '?');
const verifiesFor = (host: string): boolean => {
  const v = createVerify('SHA256');
  v.write(JSON.stringify({ host, license: lic.license, version: lic.version }));
  v.end();
  return v.verify(publicKey, lic.signature!, 'base64');
};

if (verifiesFor(currentHost)) process.exit(0);

if (lic.host && verifiesFor(lic.host)) {
  console.warn(`⚠️  Foundry's license is signed for host "${lic.host}" but this machine currently reports`);
  console.warn(`   "${currentHost}" — the hostname drifted (DHCP). This boot WILL stall on the license screen.`);
  console.warn(`   Fix durably:  sudo scutil --set HostName ${lic.host}`);
  console.warn(`   Or per-boot:  open http://localhost:${port}/license and click Agree to re-sign for the new name.`);
  console.warn('   The desktop Foundry hits the same wall on its next restart until the hostname is pinned.');
} else {
  console.warn(`⚠️  license.json signature verifies for neither "${currentHost}" nor its stored host "${lic.host}".`);
  console.warn('   Launch the desktop Foundry once to refresh Config/license.json, then re-run.');
}
process.exit(0);
