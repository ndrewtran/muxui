import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { launchBrowser, packageRoot, pageShell } from './harness.mjs';

const ROLES = ['interaction', 'state', 'dismiss', 'reveal', 'content-resize', 'modal', 'modal-dismiss'];
const part = (role, suffix) => `--muxui-semantic-motion-${role}-transition${suffix}`;

const body = ROLES.map((role) => `
  <span data-role="${role}" data-consumer="shorthand" style="transition: opacity var(${part(role, '')})"></span>
  <span data-role="${role}" data-consumer="parts" style="transition: opacity var(${part(role, '-duration')}) var(${part(role, '-easing')})"></span>`).join('');

function readConsumers(page, role) {
  return page.evaluate((role) => Object.fromEntries(['shorthand', 'parts'].map((consumer) => {
    const style = getComputedStyle(document.querySelector(`[data-role="${role}"][data-consumer="${consumer}"]`));
    return [consumer, { duration: style.transitionDuration, easing: style.transitionTimingFunction }];
  })), role);
}

test('a root override of a transition part reaches both shorthand and parts consumers', { timeout: 60_000 }, async () => {
  const css = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(pageShell({ attributes: 'data-muxui-motion="full" data-muxui-color-scheme="light"', head: `<style>${css}</style>`, body }));

    for (const role of ROLES) {
      const compiled = await readConsumers(page, role);
      assert.equal(compiled.shorthand.duration, compiled.parts.duration, `${role}: compiled durations agree`);
      assert.equal(compiled.shorthand.easing, compiled.parts.easing, `${role}: compiled easings agree`);
      assert.match(compiled.parts.easing, /^linear\(/u, `${role}: consumers get the spring curve`);

      await page.evaluate(({ duration, easing }) => {
        document.documentElement.style.setProperty(duration, '900ms');
        document.documentElement.style.setProperty(easing, 'ease-out');
      }, { duration: part(role, '-duration'), easing: part(role, '-easing') });
      const overridden = await readConsumers(page, role);
      assert.equal(overridden.parts.duration, '0.9s', `${role}: the parts consumer follows the override`);
      assert.equal(overridden.shorthand.duration, '0.9s', `${role}: the shorthand consumer follows the override`);
      assert.equal(overridden.shorthand.easing, 'ease-out', `${role}: the shorthand easing follows the override`);
      assert.equal(overridden.parts.easing, 'ease-out', `${role}: the parts easing follows the override`);
      // Code that times cleanup from the public token reads the same value consumers animate with.
      const reported = await page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), part(role, '-duration'));
      assert.equal(reported, '900ms', `${role}: the computed token matches the animated duration`);

      await page.evaluate(({ duration, easing }) => {
        document.documentElement.style.removeProperty(duration);
        document.documentElement.style.removeProperty(easing);
      }, { duration: part(role, '-duration'), easing: part(role, '-easing') });
    }
  } finally {
    await browser.close();
  }
});
