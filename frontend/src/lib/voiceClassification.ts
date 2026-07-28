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
// A plain personal name in the display name's LEADING segment (before a
// "| specialty" or ", credentials" suffix) dominates incidental institutional
// vocabulary: "Adam Feuerstein" (biotech reporter) and "Johan Pluvy | Thoracic
// Oncology" are people, not orgs. Requires >=2 letter-tokens so single-token
// hyphenated brands ("Dana-Farber", "OncoAlert") don't qualify.
const PERSONAL_NAME = /^\p{L}[\p{L}\p{M}'.-]*( \p{L}[\p{L}\p{M}'.-]*){1,3}$/u;
// Fused CamelCase brand tokens ("OncoDaily", "OncLive") read organizational —
// checked per display-name token so "OncoDaily Lung" scores too, with common
// surname prefixes (McCollom, MacDonald, DiMaggio, ...) excluded.
const ORG_CAMEL_TOKEN = /^(?!Mc|Mac|De|Di|Da|Du|La|Le|Van|Von|O')[A-Z][a-z]+[A-Z]/;

// @-mentions are employer/affiliation tags ("@statnews", "@ClevelandClinic"),
// not self-description — scanning them for institutional vocabulary mislabels
// individuals who name where they work. Strip before any org scan.
function stripMentions(text: string): string {
  return text.replace(/@\w+/g, " ");
}

// Leading segment of the display name, @-mentions and emoji/symbols removed, so
// the name-shape test isn't defeated by a trailing emoji or a specialty suffix.
function nameSegment(dn: string): string {
  return stripMentions(dn.split(/[|·]/)[0])
    .replace(/[^\p{L}\p{M} .'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyVoice(handle: string, profile: VoiceProfile | undefined): VoiceClass {
  const dn = (profile?.display_name ?? "").trim();
  const bio = (profile?.bio ?? "").trim();
  const followers = profile?.follower_count ?? 0;
  const seg = nameSegment(dn);
  const bioClean = stripMentions(bio);
  let org = 0;
  let ind = 0;
  const dnCred = IND_CRED.test(dn);
  const hasCamelToken = dn.split(/\s+/).some((t) => ORG_CAMEL_TOKEN.test(t));
  // A clean human name: personal-name shape, at least one lowercase letter (a
  // cased Latin name has one; the "JSMO" acronym in a society's name and bare
  // CJK society names do not), no institutional word, and no fused-brand token
  // (keeps two-token CamelCase brands like "OncoDaily Lung" out).
  const isPersonalName =
    PERSONAL_NAME.test(seg) && /\p{Ll}/u.test(seg) && !ORG_DN.test(seg) && !hasCamelToken;
  // Org-name vocabulary is scanned on the LEADING segment only, so a personal
  // name followed by "| Thoracic Oncology" doesn't read as institutional.
  if (ORG_DN.test(seg)) org += 2;
  if (ORG_BIO.test(bioClean)) org += 1;
  if (ORG_PLURAL.test(bioClean)) org += 1;
  if (ORG_HANDLE.test(handle) && !dnCred) org += 1;
  if (hasCamelToken) org += 1;
  if (dnCred && !/\bMD Anderson\b/i.test(dn)) ind += 2;
  if (IND_CRED.test(bioClean)) ind += 2;
  if (IND_HANDLE.test(handle)) ind += 2;
  if (IND_FIRST_PERSON.test(bioClean)) ind += 1;
  if (isPersonalName) ind += 2; // a clean human name is a strong individual signal
  if (org === ind) return followers >= 25000 ? "org" : "individual";
  return org > ind ? "org" : "individual";
}
