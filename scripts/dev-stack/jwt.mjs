// Yerel geliştirme için anon / service_role JWT üretir (HS256).
// Kullanım: node scripts/dev-stack/jwt.mjs <jwt-secret>
import { createHmac } from "node:crypto";

const secret = process.argv[2] ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
function sign(payload) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 10 * 365 * 24 * 3600;
console.log(`ANON_KEY=${sign({ iss: "supabase-demo", role: "anon", iat, exp })}`);
console.log(`SERVICE_ROLE_KEY=${sign({ iss: "supabase-demo", role: "service_role", iat, exp })}`);
