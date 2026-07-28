// Voice classification — shared between the congress detail page (individual /
// organizational panels) and the Social surface (Rising Voices shows people
// only; Moffitt and OncLive are not KOLs). ONE implementation, one set of
// tuning — do not fork this into per-surface copies.
//
// ── Voice classification (heuristic) ────────────────────────────────────────
// Splits congress voices into individual clinicians vs organizational accounts
// using account name + profile text (social_users_v2.display_name/bio) and
// handle shape. Follower count is a supporting signal only — it breaks exact
// ties, never overrides text signals. This is INFERENCE, not verification;
// every surface rendering the split must say so in the same register as the
// rest of the page. Tuned against the ASCO 2026 voice population (1,742
// accounts -> 1,286 individual / 456 org): credentials and personal-name shape
// mark individuals; institutional vocabulary, first-person-plural bios, and
// fused CamelCase brand names mark organizations. "MD Anderson" is explicitly
// excluded from the credential signal.
export type VoiceClass = "individual" | "org";

export interface VoiceProfile {
  display_name: string | null;
  bio: string | null;
  follower_count: number | null;
}

const ORG_DN = /\b(center|centre|institute|institution|hospital|university|college|academy|society|association|foundation|journal|network|alliance|coalition|consortium|congress|department|division|clinic|pharma|therapeutics|biotech|news|media|official|nonprofit|charity|advocacy|organization|group|cancer|oncology|analytics|updates|AI|bot)\b|MD Anderson/i;
const ORG_BIO = /\b(center|centre|institute|institution|hospital|university|college|academy|society|association|foundation|journal|network|alliance|coalition|consortium|department|division|clinic|pharma|therapeutics|biotech|news|media|official|nonprofit|charity|advocacy|organization)\b/i;
const ORG_HANDLE = /(news|alert|today|daily|live|official|center|health|hosp|univ|journal|pharma)/i;
const ORG_PLURAL = /\b(we|our|us|join us|follow us)\b/i;
const IND_CRED = /\b(MD|M\.D\.|PhD|Ph\.D\.|MBBS|DO|PharmD|MPH|MSc|RN|NP|PA-C|FACP|FASCO|FRCP|FRCPC|Prof|Professor|Dr|Dra)\b\.?/;
const IND_HANDLE = /(^dr[_a-z]|_dr_|md$|_md|phd$|_phd)/i;
const IND_FIRST_PERSON = /\b(I|I'm|my|mine|me)\b/;
const IND_NAME_SHAPE = /^[\p{L}]+([ .'-][\p{L}]+){1,3}\.?$/u;
// Fused CamelCase brand tokens ("OncoDaily", "OncLive") read organizational —
// checked per display-name token so "OncoDaily Lung" scores too, with common
// surname prefixes (McCollom, MacDonald, DiMaggio, ...) excluded.
const ORG_CAMEL_TOKEN = /^(?!Mc|Mac|De|Di|Da|Du|La|Le|Van|Von|O')[A-Z][a-z]+[A-Z]/;

export function classifyVoice(handle: string, profile: VoiceProfile | undefined): VoiceClass {
  const dn = (profile?.display_name ?? "").trim();
  const bio = (profile?.bio ?? "").trim();
  const followers = profile?.follower_count ?? 0;
  let org = 0;
  let ind = 0;
  const dnCred = IND_CRED.test(dn);
  if (ORG_DN.test(dn)) org += 2;
  if (ORG_BIO.test(bio)) org += 1;
  if (ORG_PLURAL.test(bio)) org += 1;
  if (ORG_HANDLE.test(handle) && !dnCred) org += 1;
  if (dn.split(/\s+/).some((t) => ORG_CAMEL_TOKEN.test(t))) org += 1;
  if (dnCred && !/\bMD Anderson\b/i.test(dn)) ind += 2;
  if (IND_CRED.test(bio)) ind += 2;
  if (IND_HANDLE.test(handle)) ind += 2;
  if (IND_FIRST_PERSON.test(bio)) ind += 1;
  if (IND_NAME_SHAPE.test(dn) && !ORG_DN.test(dn)) ind += 1;
  if (org === ind) return followers >= 25000 ? "org" : "individual";
  return org > ind ? "org" : "individual";
}
