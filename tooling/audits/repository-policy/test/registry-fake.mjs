// An in-process npm registry for the publication tests (E-P2.1-06): the public read endpoints
// npm-publication.mjs uses (a version document, a packument, and a version's tarball) and a `publish` that stands in for
// `npm publish --tag next --provenance`. No network and no real registry; every request and every write is
// recorded, and there is no way to deprecate, unpublish, or re-tag, so a test can assert none happened.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLISHING_REPOSITORY, PUBLISHING_WORKFLOW, REGISTRY } from '../src/npm-publication.mjs';
import { readArchive } from '../src/release-archive.mjs';

const slsa = { predicateType: 'https://slsa.dev/provenance/v1' };

/** The SLSA provenance statement the registry holds for a publish by this repository's workflow, in the shape npm records it. */
export const statementOf = ({ name, version, integrity, commit }) => ({
  _type: 'https://in-toto.io/Statement/v1',
  subject: [{ name: `pkg:npm/${name.replace('@', '%40')}@${version}`, digest: { sha512: Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex') } }],
  predicateType: slsa.predicateType,
  predicate: {
    buildDefinition: {
      externalParameters: { workflow: { ref: 'refs/heads/main', repository: `https://github.com/${PUBLISHING_REPOSITORY}`, path: PUBLISHING_WORKFLOW } },
      resolvedDependencies: [{ uri: `git+https://github.com/${PUBLISHING_REPOSITORY}@refs/heads/main`, digest: { gitCommit: commit } }],
    },
    runDetails: { metadata: { invocationId: `https://github.com/${PUBLISHING_REPOSITORY}/actions/runs/41754361620/attempts/1` } },
  },
});

/** The registry's attestation document: npm's own publish attestation and the SLSA provenance one, each a DSSE envelope. */
export const attestationDocument = (statement) => ({
  attestations: [
    { predicateType: 'https://github.com/npm/attestation/tree/main/specs/publish/v0.1', bundle: { dsseEnvelope: { payloadType: 'application/vnd.in-toto+json', payload: Buffer.from('{}').toString('base64') } } },
    { predicateType: slsa.predicateType, bundle: { dsseEnvelope: { payloadType: 'application/vnd.in-toto+json', payload: Buffer.from(JSON.stringify(statement)).toString('base64') } } },
  ],
});

/**
 * `seed` maps a package name to { versions: { [version]: integrity }, tags, tarballs: { [version]: bytes }, commit } already
 * on the registry: a version with bytes and no integrity is listed at the integrity of those bytes, and one with both is
 * served the bytes whatever integrity its document declares. Every version carries the SLSA provenance attestation of a
 * publish by this repository's workflow at `commit` (or the package's `commit`), which a test edits through
 * `attestation(name, version)`. `faults`
 * names the package each failure hits: `refuse` (npm rejects the publish and writes nothing), `corrupt` (the
 * registry ends up with other bytes), `unattested` (no provenance attestation), `invisible` (the publish lands
 * and never becomes readable, as a registry that does not propagate), and `landThenFail` (the publish lands, the
 * command errors, and reads return 404 until `reveal(name)`, as a timeout after npm accepted the PUT).
 */
export function createRegistry({ seed = {}, faults: initialFaults = {}, commit: defaultCommit = 'f'.repeat(40) } = {}) {
  const faults = { ...initialFaults };
  const packuments = new Map();
  const hidden = new Set();
  const requests = [];
  const writes = [];
  const files = new Map();
  const statements = new Map();
  const redirected = new Set();
  const sri = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const tarballUrl = (name, version) => `${REGISTRY}/${name}/-/${name.split('/')[1]}-${version}.tgz`;
  const attestationUrl = (name, version) => `${REGISTRY}/-/npm/v1/attestations/${name.replace('/', '%2f')}@${version}`;
  const add = (name, version, integrity, { attested = true, bytes, commit = defaultCommit } = {}) => {
    const packument = packuments.get(name) ?? { 'dist-tags': {}, versions: {} };
    packument.versions[version] = { name, version, dist: { integrity, tarball: tarballUrl(name, version), ...(attested ? { attestations: { url: attestationUrl(name, version), provenance: slsa } } : {}) } };
    if (attested) statements.set(attestationUrl(name, version), statementOf({ name, version, integrity, commit }));
    if (bytes) files.set(tarballUrl(name, version), bytes);
    packuments.set(name, packument);
    return packument;
  };
  for (const [name, { versions = {}, tags, tarballs = {}, commit }] of Object.entries(seed)) {
    for (const [version, integrity] of Object.entries(versions)) add(name, version, integrity, { bytes: tarballs[version], commit });
    for (const [version, bytes] of Object.entries(tarballs)) if (!(version in versions)) add(name, version, sri(bytes), { bytes, commit });
    packuments.get(name)['dist-tags'] = { ...tags };
  }

  const respond = (status, body) => ({ status, json: async () => body });

  /**
   * The `fetch` npm-publication.mjs reads the registry through. It must be asked not to follow redirects, as every read of
   * the public registry is; a URL given to `redirect` answers as a redirect, which that request refuses.
   */
  async function fetch(url, init = {}) {
    requests.push(String(url));
    if (!String(url).startsWith(`${REGISTRY}/`)) throw new Error(`the fake registry only serves ${REGISTRY}, not ${url}`);
    if (init.redirect !== 'error') throw new Error(`the read of ${url} would follow a redirect: it did not pass redirect: 'error'`);
    if (redirected.has(String(url))) throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') });
    if (statements.has(String(url))) return respond(200, attestationDocument(statements.get(String(url))));
    if (files.has(String(url))) {
      const bytes = files.get(String(url));
      return { status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
    }
    if (String(url).includes('/-/')) return respond(404, null);
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
    const integrity = faults.corrupt?.includes(name) ? `sha512-${createHash('sha512').update(`other ${bytes.toString('base64')}`).digest('base64')}` : sri(bytes);
    const first = !packuments.has(name);
    // The publish workflow's provenance names the commit of its run, which the packed manifest records as gitHead.
    const { gitHead } = JSON.parse(readArchive(bytes).get('package/package.json')?.toString('utf8') ?? '{}');
    const packument = add(name, version, integrity, { attested: !faults.unattested?.includes(name), bytes, commit: gitHead ?? defaultCommit });
    // `--tag next` moves next; the registry itself sets latest on a package's first version.
    packument['dist-tags'].next = version;
    if (first) packument['dist-tags'].latest = version;
    if (faults.invisible?.includes(name) || faults.landThenFail?.includes(name)) hidden.add(name);
    writes.push({ op: 'publish', name, version, tag: 'next', auth: token ? 'token' : 'oidc' });
    if (faults.landThenFail?.includes(name)) throw new Error(`npm error code ETIMEDOUT\nnpm error network request to ${REGISTRY}/${name} timed out after the registry accepted it`);
  }

  /**
   * The `npm` the post-publication check runs, answered from what the registry holds: `install` writes the package-lock.json
   * of the project's dependencies (an exact version that is not readable fails the install), and `audit signatures` verifies
   * each installed version's registry signature and lists its attestation bundles. `auditFaults` maps a package name to
   * `invalid` or `missing`, as npm reports a bad signature. Every call is recorded in `npmCalls`.
   */
  const npmCalls = [];
  const auditFaults = {};
  function npm(args, { cwd }) {
    npmCalls.push(args.join(' '));
    if (args[0] === '--version') return { status: 0, stdout: '11.17.0\n', stderr: '' };
    const dependencies = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).dependencies;
    const documentOf = (name, version) => (hidden.has(name) ? undefined : packuments.get(name)?.versions[version]);
    if (args[0] === 'install') {
      const missing = Object.entries(dependencies).filter(([name, version]) => !documentOf(name, version));
      if (missing.length > 0) return { status: 1, stdout: '', stderr: `npm error code ETARGET\nnpm error notarget No matching version found for ${missing[0].join('@')}.` };
      const packages = Object.fromEntries(Object.entries(dependencies).map(([name, version]) => [`node_modules/${name}`, { version, resolved: documentOf(name, version).dist.tarball, integrity: documentOf(name, version).dist.integrity }]));
      writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies }, ...packages } }));
      return { status: 0, stdout: '', stderr: '' };
    }
    if (args.join(' ') === 'audit signatures --json --include-attestations') {
      const entries = Object.entries(dependencies).map(([name, version]) => {
        const url = documentOf(name, version)?.dist.attestations?.url;
        return { name, version, location: `node_modules/${name}`, registry: `${REGISTRY}/`, ...(url ? { attestationBundles: attestationDocument(statements.get(url)).attestations } : {}) };
      });
      const result = { invalid: entries.filter(({ name }) => auditFaults[name] === 'invalid'), missing: entries.filter(({ name }) => auditFaults[name] === 'missing'), verified: entries.filter(({ name }) => !auditFaults[name]) };
      return { status: result.invalid.length + result.missing.length > 0 ? 1 : 0, stdout: JSON.stringify(result), stderr: '' };
    }
    return { status: 1, stdout: '', stderr: `the fake npm does not run ${args.join(' ')}` };
  }

  /** npm-publication.mjs's injectable IO with no real waiting and short polling. */
  const io = (extra = {}) => ({
    fetch, runNpm: npm, sleep: async () => {}, log: () => {}, intervalMs: 0, versionAttempts: 2, tagAttempts: 2, installAttempts: 2, ...extra,
  });

  return {
    fetch,
    publish,
    npm,
    npmCalls,
    /** The packages `npm audit signatures` reports as `invalid` or `missing`. */
    auditFaults,
    io,
    /** The failures in force; a test clears one to let a later publication succeed. */
    faults,
    requests,
    writes,
    /** Ends a package's propagation delay: its reads show what landed. */
    reveal: (name) => hidden.delete(name),
    /** The recorded state of one package, as the registry holds it now. */
    packument: (name) => packuments.get(name) ?? null,
    /** The provenance statement the registry serves for a version; edit it to change what the attestation says. */
    attestation: (name, version) => statements.get(attestationUrl(name, version)),
    /** Makes a URL answer as a redirect. */
    redirect: (url) => redirected.add(url),
  };
}
