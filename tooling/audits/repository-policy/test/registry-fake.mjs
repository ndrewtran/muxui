// An in-process npm registry for the publication tests (E-P2.1-06): the two public read endpoints
// npm-publication.mjs uses (a version document and a packument) and a `publish` that stands in for
// `npm publish --tag next --provenance`. No network and no real registry; every request and every write is
// recorded, and there is no way to deprecate, unpublish, or re-tag, so a test can assert none happened.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { REGISTRY } from '../src/npm-publication.mjs';

const slsa = { predicateType: 'https://slsa.dev/provenance/v1' };

/**
 * `seed` maps a package name to { versions: { [version]: integrity }, tags } already on the registry. `faults`
 * names the package each failure hits: `refuse` (npm rejects the publish and writes nothing), `corrupt` (the
 * registry ends up with other bytes), `unattested` (no provenance attestation), `invisible` (the publish lands
 * and never becomes readable, as a registry that does not propagate), and `landThenFail` (the publish lands, the
 * command errors, and reads return 404 until `reveal(name)`, as a timeout after npm accepted the PUT).
 */
export function createRegistry({ seed = {}, faults: initialFaults = {} } = {}) {
  const faults = { ...initialFaults };
  const packuments = new Map();
  const hidden = new Set();
  const requests = [];
  const writes = [];
  const add = (name, version, integrity, { attested = true } = {}) => {
    const packument = packuments.get(name) ?? { 'dist-tags': {}, versions: {} };
    packument.versions[version] = { name, version, dist: { integrity, ...(attested ? { attestations: { provenance: slsa } } : {}) } };
    packuments.set(name, packument);
    return packument;
  };
  for (const [name, { versions, tags }] of Object.entries(seed)) {
    for (const [version, integrity] of Object.entries(versions)) add(name, version, integrity);
    packuments.get(name)['dist-tags'] = { ...tags };
  }

  const respond = (status, body) => ({ status, json: async () => body });

  /** The `fetch` npm-publication.mjs reads the registry through. */
  async function fetch(url) {
    requests.push(String(url));
    if (!String(url).startsWith(`${REGISTRY}/`)) throw new Error(`the fake registry only serves ${REGISTRY}, not ${url}`);
    // A scoped package name is two path segments; a version follows it.
    const [, name, version] = /^(@[^/]+\/[^/]+)(?:\/([^/]+))?$/u.exec(String(url).slice(REGISTRY.length + 1)) ?? [];
    if (name === undefined) return respond(404, null);
    const packument = packuments.get(name);
    if (!packument || hidden.has(name)) return respond(404, null);
    if (version === undefined) return respond(200, packument);
    return packument.versions[version] ? respond(200, packument.versions[version]) : respond(404, null);
  }

  /**
   * The `publish` standing in for `npm publish <file> --tag next --provenance`: lands the file's real bytes. `token` is the
   * credential this one command was given. Trusted publishing cannot create a package, so a package that is absent needs a
   * token; an existing package must publish without one (OIDC), and a token handed to it is a policy failure.
   */
  async function publish({ name, version, file }, { token } = {}) {
    if (!packuments.has(name) && !token) throw new Error(`npm error code ENEEDAUTH\nnpm error trusted publishing cannot create ${name}`);
    if (packuments.has(name) && token) throw new Error(`policy violation: a token was used to publish the existing package ${name}`);
    if (faults.refuse?.includes(name)) throw new Error(`npm error code E403\nnpm error 403 Forbidden - PUT ${REGISTRY}/${name} - refused`);
    const bytes = readFileSync(file);
    const integrity = faults.corrupt?.includes(name) ? `sha512-${createHash('sha512').update(`other ${bytes.toString('base64')}`).digest('base64')}` : `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    const first = !packuments.has(name);
    const packument = add(name, version, integrity, { attested: !faults.unattested?.includes(name) });
    // `--tag next` moves next; the registry itself sets latest on a package's first version.
    packument['dist-tags'].next = version;
    if (first) packument['dist-tags'].latest = version;
    if (faults.invisible?.includes(name) || faults.landThenFail?.includes(name)) hidden.add(name);
    writes.push({ op: 'publish', name, version, tag: 'next', auth: token ? 'token' : 'oidc' });
    if (faults.landThenFail?.includes(name)) throw new Error(`npm error code ETIMEDOUT\nnpm error network request to ${REGISTRY}/${name} timed out after the registry accepted it`);
  }

  /** npm-publication.mjs's injectable IO with no real waiting and short polling. */
  const io = (extra = {}) => ({
    fetch, sleep: async () => {}, log: () => {}, intervalMs: 0, versionAttempts: 2, tagAttempts: 2, ...extra,
  });

  return {
    fetch,
    publish,
    io,
    /** The failures in force; a test clears one to let a later publication succeed. */
    faults,
    requests,
    writes,
    /** Ends a package's propagation delay: its reads show what landed. */
    reveal: (name) => hidden.delete(name),
    /** The recorded state of one package, as the registry holds it now. */
    packument: (name) => packuments.get(name) ?? null,
  };
}
