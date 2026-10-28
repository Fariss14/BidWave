import { X509Certificate } from 'node:crypto';

export function databaseTlsOptions(certificate) {
  if (!certificate?.trim()) return { rejectUnauthorized: true };
  let pem = certificate.trim();
  if ((pem.startsWith('"') && pem.endsWith('"')) || (pem.startsWith("'") && pem.endsWith("'"))) pem = pem.slice(1, -1);
  pem = pem.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n/g, '\n');
  const blocks = [...pem.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)].map((match) => match[0]);
  if (!blocks.length) throw new Error('DATABASE_CA_CERT must contain the complete PEM certificate text, not a filename or download URL.');
  try { for (const block of blocks) new X509Certificate(block); }
  catch { throw new Error('DATABASE_CA_CERT is not a valid PEM certificate. Paste the complete downloaded Supabase CA certificate with its BEGIN and END lines.'); }
  return { rejectUnauthorized: true, ca: blocks };
}
