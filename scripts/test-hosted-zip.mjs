// PURPOSE: Automated maintenance and release script for test-hosted-zip.mjs.
import crypto from 'crypto';

const url = 'https://vault-app-ba6e2.web.app/bundles/4.0.5.zip';
console.log('Fetching:', url);

try {
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error('❌ Failed to fetch. Status:', resp.status, resp.statusText);
    process.exit(1);
  }
  const buffer = await resp.arrayBuffer();
  const hashSum = crypto.createHash('sha256');
  hashSum.update(Buffer.from(buffer));
  const checksum = hashSum.digest('hex');
  console.log('🔥 Hosted ZIP SHA-256 Checksum:', checksum);
  console.log('📏 Hosted ZIP Size in bytes:', buffer.byteLength);
} catch (err) {
  console.error('❌ Error during fetch:', err);
}
process.exit(0);
