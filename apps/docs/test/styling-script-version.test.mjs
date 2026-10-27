// The page script of the Styling section is served at a URL that names its content, and the check reads the build's copy to know what every page must
// load: this proves it reports a build whose files are wrong (none, several, an unversioned copy, a name that is not its content's hash) and gives
// the URL of the content's hash when there is one copy to read (with several copies the URL is not defined, the build fails either way).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { measuredScript } from '../scripts/styling-expectation.mjs';

const script = '"use strict";(()=>{document.title="measured";})();';
const hashOf = (content) => createHash('sha256').update(content).digest('hex').slice(0, 12);

/** A build with the files under `_muxui` that the case names, each `[name, content]`. */
function build(files) {
	const dist = mkdtempSync(join(tmpdir(), 'muxui-script-version-'));
	mkdirSync(join(dist, '_muxui'));
	writeFileSync(join(dist, '_muxui', 'theme-prepaint.js'), '/* another script */');
	for (const [name, content] of files) writeFileSync(join(dist, '_muxui', name), content);
	return dist;
}

test('the build\'s page script gives the URL every page must load, and a build that is wrong says how', () => {
	const cases = [
		['one copy named for its content', [[`styling-measure.${hashOf(script)}.js`, script]], { url: `/_muxui/styling-measure.${hashOf(script)}.js`, problems: 0 }],
		['a copy whose name is another content\'s hash', [['styling-measure.0123456789ab.js', script]], { url: `/_muxui/styling-measure.${hashOf(script)}.js`, problems: 1 }],
		['a copy changed after it was named', [[`styling-measure.${hashOf(script)}.js`, `${script}\n`]], { url: `/_muxui/styling-measure.${hashOf(`${script}\n`)}.js`, problems: 1 }],
		['an unversioned copy only', [['styling-measure.js', script]], { url: null, problems: 1 }],
		['the right copy and an old one beside it', [[`styling-measure.${hashOf(script)}.js`, script], ['styling-measure.0123456789ab.js', 'old']], { problems: 1 }],
		['the right copy and an unversioned one', [[`styling-measure.${hashOf(script)}.js`, script], ['styling-measure.js', script]], { problems: 1 }],
		['no copy', [], { url: null, problems: 1 }],
	];
	for (const [label, files, wanted] of cases) {
		const dist = build(files);
		try {
			const found = measuredScript(dist);
			if ('url' in wanted) assert.equal(found.url, wanted.url, `${label}: the URL`);
			assert.equal(found.problems.length === 0, wanted.problems === 0, `${label}: ${JSON.stringify(found.problems)}`);
		} finally {
			rmSync(dist, { recursive: true, force: true });
		}
	}
});
