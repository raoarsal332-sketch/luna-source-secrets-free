'use strict';
/**
 * teammateAdmins.js — who may issue ticket-level Luna commands.
 *
 * Authorization is by VERIFIED Intercom admin id only. Display names and @mention text are
 * never consulted here: a name can be spoofed, an id from the part author metadata cannot.
 *
 * bot-teammate-admins.json IS THE SOURCE OF TRUTH.
 *
 * It used to be merged with a built-in seed and with bot-teammate-capabilities.json, which meant
 * deleting a seeded teammate from the config did not actually revoke them - the seed put them
 * straight back. Revocation now works: when the config file is present and parses, the set it
 * declares is exactly the authorized set. Nothing is merged into it.
 *
 * Resolution order:
 *   valid file, >= 1 id  -> exactly those ids (authoritative; removing an id revokes it)
 *   valid file, 0 ids    -> nobody is authorized (an explicit, honoured revocation)
 *   malformed/unreadable -> keep the LAST KNOWN GOOD set; never widen, never silently revoke
 *   file absent          -> bootstrap seed only, logged loudly (first boot / file deleted)
 *
 * FAIL CLOSED throughout. An id counts only as a plain digit string, so "*", "all", true, {},
 * a display name or @mention text can never become a principal. There is no wildcard branch.
 */
const fs = require('fs');

const ADMINS_FILE = process.env.LUNA_TEAMMATE_ADMINS_FILE || '/home/ubuntu/bot-teammate-admins.json';

// Bootstrap only: used when the config file does not exist at all (first boot, or the file was
// deleted). Once the file exists it is authoritative and this list is NOT consulted, so removing
// a seeded id from the file really revokes it.
const SEED_IDS = [
  '10118526', // Arsal - Manager (owner)
  '8053416', // Jerry - Manager
  '8083638', '9165188', '9448094', '9448672', '9694122', '9807116',
  '9834244', '9847205', '9847906', '9962536', '10182292', '10324823', '10324840',
];

/** An Intercom admin id is a plain digit string. Anything else is not an id. */
function isValidAdminId(value) {
  return typeof value === 'string' && /^[0-9]{3,20}$/.test(value);
}

/** Ids out of one config file. Returns [] for anything malformed - never a wildcard. */
function idsFromFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (_) {
    return { ids: [], status: 'absent' };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('TEAMMATE_ADMINS malformed JSON, ignoring file (fail closed)', file, e && e.message);
    return { ids: [], status: 'malformed' };
  }
  let candidates = [];
  if (Array.isArray(parsed)) {
    candidates = parsed.map((x) => (x && typeof x === 'object' ? x.id : x));
  } else if (parsed && typeof parsed === 'object') {
    // { "<id>": {...} } or { admins: [...] } / { ids: [...] }
    const list = parsed.admins || parsed.ids;
    candidates = Array.isArray(list)
      ? list.map((x) => (x && typeof x === 'object' ? x.id : x))
      : Object.keys(parsed);
  } else {
    console.error('TEAMMATE_ADMINS unexpected shape, ignoring file (fail closed)', file);
    return { ids: [], status: 'malformed' };
  }
  const ids = [];
  for (const c of candidates) {
    const s = c == null ? '' : String(c).trim();
    if (isValidAdminId(s)) ids.push(s);
    else if (s) console.error('TEAMMATE_ADMINS rejected non-id entry', file, JSON.stringify(s).slice(0, 40));
  }
  return { ids, status: ids.length ? 'loaded' : 'empty' };
}

function build(previousSet) {
  const sources = {};
  const { ids, status } = idsFromFile(ADMINS_FILE);
  sources.admins = { status, count: ids.length };

  if (status === 'loaded' || status === 'empty') {
    // The file parsed. It is authoritative - no seed, no capabilities merge - so an id removed
    // from it is genuinely revoked, and an empty list authorizes nobody.
    return { set: new Set(ids), sources, authority: 'config' };
  }
  if (status === 'malformed') {
    // Never widen and never mass-revoke on a bad edit: hold the last good set.
    if (previousSet && previousSet.size) {
      console.error('TEAMMATE_ADMINS malformed config , keeping last known good set (fail closed)');
      return { set: new Set(previousSet), sources, authority: 'last-known-good' };
    }
    console.error('TEAMMATE_ADMINS malformed config at startup , bootstrapping from seed');
    return { set: new Set(SEED_IDS.filter(isValidAdminId)), sources, authority: 'seed-bootstrap' };
  }
  // status === 'absent'
  console.error('TEAMMATE_ADMINS config file ABSENT , bootstrapping from seed:', ADMINS_FILE);
  return { set: new Set(SEED_IDS.filter(isValidAdminId)), sources, authority: 'seed-bootstrap' };
}

let _built = build(null);

/** Startup validation. Logs what was loaded; never logs a secret or a display name. */
function validateAtStartup() {
  const { set, sources } = _built;
  console.log('TEAMMATE_ADMINS loaded', JSON.stringify({ authorized: set.size, authority: _built.authority, sources }));
  if (!set.size) {
    // Cannot happen while the seed is valid, but if it ever did, nobody is authorized -
    // which is the safe direction.
    console.error('TEAMMATE_ADMINS EMPTY , no teammate may command Luna (fail closed)');
  }
  return set.size;
}

function isAuthorizedAdminId(authorId) {
  const id = authorId == null ? '' : String(authorId).trim();
  if (!isValidAdminId(id)) return false; // rejects '', '*', 'all', objects, display names
  return _built.set.has(id);
}

/**
 * Re-read the config and swap it in ATOMICALLY: the new set is fully built and validated before
 * it replaces the live one, so no request can ever observe a half-applied list. If the file is
 * malformed the previous set is retained and the reload reports failure.
 * @returns {{ok: boolean, authorized: number, authority: string, changed: boolean}}
 */
function reload() {
  const previous = _built.set;
  const next = build(previous);
  const ok = next.authority === 'config';
  const changed = next.set.size !== previous.size
    || [...next.set].some((id) => !previous.has(id))
    || [...previous].some((id) => !next.set.has(id));
  _built = next; // single assignment = atomic swap for every later isAuthorizedAdminId() call
  console.log('TEAMMATE_ADMINS reload', JSON.stringify({ ok, authorized: next.set.size, authority: next.authority, changed }));
  return { ok, authorized: next.set.size, authority: next.authority, changed };
}

function size() { return _built.set.size; }
function authority() { return _built.authority; }
function snapshot() { return new Set(_built.set); }

module.exports = {
  isAuthorizedAdminId, validateAtStartup, reload, size, snapshot, authority,
  isValidAdminId, SEED_IDS, ADMINS_FILE,
};
