// Component and Block page colours are collected during the axe visit (./helpers/page-visit.mjs).
// This file keeps the colour audit's unit proofs and the static checks of the Storybook theme and canvas palette.
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { collectStorybookPaints } from './helpers/color-audit.mjs';
import { tokenGraphs as graphs } from './helpers/page-visit.mjs';
import { AVATAR_LOADED_SRC } from '../src/storybook-factory.mjs';
import { backgroundOptions, buildTheme, managerThemeCss, previewThemeCss } from '../.storybook/theme.mjs';
import { projectMeasurePalette } from '../.storybook/measure-palette.mjs';

const appRoot = resolve(import.meta.dirname, '..');

async function browserPath() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN, process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Chrome or Chromium is required for the Storybook colour audit');
}

test('Storybook colour audit detects solid, alpha, shadow, gradient, SVG and pseudo-element leaks', async () => {
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  try {
    const page = await browser.newPage();
    const foreground = graphs.light['semantic.content.strong'].value;
    const transparentPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';
    const opaquePixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3Crect width='1' height='1' fill='red'/%3E%3C/svg%3E";
    await page.setContent(`<style>
      body { color:${foreground}; background:${graphs.light['semantic.surface.canvas'].value} }
      div { width:80px; height:25px }
      #pseudo::before { content:""; display:block; width:8px; height:8px; background:rgb(1,2,3) }
      #marker::marker { color:rgb(2,3,4) }
      #selection::selection { background:rgb(2,3,4); color:rgb(1,2,3) }
    </style>
    <div id="solid" style="color:rgb(1,2,3)">solid</div>
    <div id="alpha" style="color:rgb(from ${foreground} r g b / .123)">alpha</div>
    <div id="shadow" style="box-shadow:0 0 2px rgb(1,2,3)">shadow</div>
    <div id="text-shadow" style="text-shadow:0 1px 2px rgb(1,2,3)">text</div>
    <div id="filter" style="filter:drop-shadow(0 0 2px rgb(1,2,3))">filter</div>
    <div id="gradient" style="background:linear-gradient(rgb(1,2,3),${foreground})"></div>
    <div id="border" style="border:1px solid rgb(1,2,3)"></div>
    <div id="outline" style="outline:1px solid rgb(1,2,3)"></div>
    <div id="pseudo"></div><svg width="10" height="10"><rect id="svg" width="10" height="10" fill="rgb(1,2,3)"/></svg>
    <svg width="10" height="10"><defs><symbol id="shape"><rect width="10" height="10"/></symbol></defs>
      <use id="svg-use" href="#shape" fill="rgb(1,2,3)"/></svg>
    <svg width="10" height="10"><defs><linearGradient id="paint"><stop stop-color="rgb(1,2,3)"/>
      <stop offset="1" stop-color="${foreground}" stop-opacity=".123"/></linearGradient></defs>
      <rect id="svg-gradient" width="10" height="10" fill="url(#paint)"/></svg>
    <ul><li id="marker">marker</li></ul><div id="selection">selection</div>
    <div id="scrollbar" style="height:20px;overflow:scroll;scrollbar-color:rgb(3,4,5) ${foreground}"><div style="height:80px"></div></div>
    <svg width="50" height="50"><defs><text id="text-shape" y="20" fill="rgb(3,4,5)">Hi</text>
      <rect id="hidden-fill" width="10" height="10" fill="rgb(1,2,3)" fill-opacity="0"/>
      <rect id="hidden-stroke" width="10" height="10" fill="none" stroke="rgb(1,2,3)" stroke-width="0"/>
      </defs><use id="svg-text-use" href="#text-shape"/><use id="no-paint-fill" href="#hidden-fill"/>
      <use id="no-paint-stroke" href="#hidden-stroke"/></svg><canvas id="canvas" width="10" height="10"></canvas>
      <img width="10" height="10" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='red'/%3E%3C/svg%3E">
      <img id="transparent-pixel" width="10" height="10" src="${transparentPixel}">
      <img id="opaque-pixel" width="10" height="10" src="${opaquePixel}">`);
    await page.locator('#transparent-pixel').evaluate((image) => image.decode());
    await page.locator('#opaque-pixel').evaluate((image) => image.decode());
    const transparentPixelSource = await page.locator('#transparent-pixel').evaluate((image) => image.currentSrc);
    const opaquePixelSource = await page.locator('#opaque-pixel').evaluate((image) => image.currentSrc);
    await page.locator('#selection').evaluate((element) => {
      const range = document.createRange(); range.selectNodeContents(element);
      document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
    });
    const canvasPaints = await page.locator('#canvas').evaluate((element) => {
      const context = element.getContext('2d');
      context.fillStyle = 'rgb(1,2,3)'; context.fillRect(0, 0, 10, 10);
      return [{ id: element.id, property: 'fillStyle', value: context.fillStyle, alpha: context.globalAlpha, composite: context.globalCompositeOperation }];
    });
    const report = await page.evaluate(collectStorybookPaints, { tokens: graphs.light, canvasPaints });
    assert.deepEqual(report.problems, []);
    assert.ok(report.media.some((source) => source.startsWith('img: data:image/svg+xml,')), 'Image paint cannot be silently excluded');
    assert.ok(report.media.includes(`img: ${opaquePixelSource}`), 'Opaque single-pixel image paint remains unverified');
    assert.ok(!report.media.includes(`img: ${transparentPixelSource}`), 'A decoded transparent pixel has no visible image paint');
    for (const id of ['solid', 'alpha', 'shadow', 'text-shadow', 'filter', 'gradient', 'border', 'outline', 'pseudo', 'svg', 'svg-use', 'svg-gradient', 'svg-text-use', 'marker', 'selection', 'scrollbar', 'canvas']) {
      assert.ok(report.nonToken.some((paint) => paint.examples.some((example) => example.includes(`#${id}`))), `audit missed ${id}`);
    }
    assert.ok(report.nonToken.some((paint) => paint.rgba.endsWith(',0.123')), 'alpha must remain part of colour identity');
    assert.ok(!report.nonToken.some((paint) => paint.examples.some((example) => example.includes('#no-paint-'))), 'Unpainted SVG fill/stroke must remain unpainted');
  } finally { await browser.close(); }
});

test('Storybook colour audit verifies an image only when every decoded pixel is a canonical colour', async () => {
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  const channels = (hex) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  try {
    const page = await browser.newPage();
    for (const scheme of ['light', 'dark']) {
      const tokens = graphs[scheme];
      // Reference colours keep their value in both schemes, so one image is canonical in each.
      const [pale, strong] = ['reference.color.bluegreen-20', 'reference.color.bluegreen-70'].map((id) => tokens[id].value);
      await page.setContent(`<html><body style="color:${tokens['semantic.content.strong'].value};background:${tokens['semantic.surface.canvas'].value}">
        <p>Image audit</p><img id="avatar" width="40" height="40" src="${AVATAR_LOADED_SRC}"></body></html>`);
      // Alternating pixels either side of the pale colour: each 2 by 2 block averages back to it exactly.
      const [paleRed, paleGreen, paleBlue] = channels(pale);
      const checker = Array.from({ length: 16 * 16 }, (_, index) => {
        const [x, y] = [index % 16, Math.floor(index / 16)];
        return [`rgb(${paleRed + ((x + y) % 2 ? -8 : 8)}, ${paleGreen}, ${paleBlue})`, x, y, 1, 1];
      });
      const images = [
        { id: 'canonical', size: 8, fills: [[pale, 0, 0, 8, 8], [strong, 2, 2, 4, 4]] },
        // A 2x candidate reports half its bitmap size, so these would be sampled resampled: averaged into the palette,
        // or under the 4096 pixel limit.
        { id: 'averaged-by-density', size: 16, density: 'srcset', fills: checker },
        { id: 'oversized-by-density', size: 128, density: 'srcset', fills: [[pale, 0, 0, 128, 128]] },
        { id: 'in-picture', size: 8, density: 'picture', fills: [[pale, 0, 0, 8, 8]] },
        { id: 'off-palette', size: 8, fills: [[pale, 0, 0, 8, 8], ['rgb(1, 2, 3)', 2, 2, 1, 1]] },
        { id: 'half-transparent', size: 8, alpha: 0.5, fills: [[pale, 0, 0, 8, 8]] },
        { id: 'oversized', size: 65, fills: [[pale, 0, 0, 65, 65]] },
        { id: 'clear', size: 8, fills: [] },
      ];
      const sources = await page.evaluate(async (specs) => {
        const found = {};
        for (const { id, size, alpha = 1, density, fills } of specs) {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const context = canvas.getContext('2d');
          context.globalAlpha = alpha;
          for (const [colour, x, y, width, height] of fills) {
            context.fillStyle = colour;
            context.fillRect(x, y, width, height);
          }
          const image = new Image(size, size);
          image.id = id;
          const source = canvas.toDataURL('image/png');
          image.src = source;
          if (density === 'srcset') image.srcset = `${source} 2x`;
          if (density === 'picture') {
            const picture = document.createElement('picture');
            const candidate = document.createElement('source');
            candidate.srcset = `${source} 2x`;
            picture.append(candidate, image);
            document.body.append(picture);
          } else {
            document.body.append(image);
          }
          await image.decode();
          found[id] = image.currentSrc;
        }
        found.avatar = document.querySelector('#avatar').currentSrc;
        await document.querySelector('#avatar').decode();
        return found;
      }, images);
      const report = await page.evaluate(collectStorybookPaints, { tokens });
      const unverified = (id) => report.media.includes(`img: ${sources[id]}`);
      assert.deepEqual(report.problems, [], scheme);
      assert.deepEqual(report.nonToken, [], `${scheme}: verified image pixels are canonical colours`);
      for (const id of ['canonical', 'clear', 'avatar']) assert.equal(unverified(id), false, `${scheme}: ${id} is verified`);
      for (const id of ['off-palette', 'half-transparent', 'oversized', 'averaged-by-density', 'oversized-by-density', 'in-picture']) {
        assert.equal(unverified(id), true, `${scheme}: ${id} stays unverified`);
      }
      // The verified pixels count as paint: the two image colours, and the avatar's two, are the same palette pair.
      const pixels = report.paints.filter(({ property }) => property === 'image-pixel');
      assert.deepEqual(pixels.map(({ rgba }) => rgba).sort(), [...new Set([strong, pale].map((hex) => `${channels(hex).join(',')},1`))].sort(), scheme);
      assert.ok(pixels.every(({ token }) => token), `${scheme}: image pixels map to tokens`);
      assert.equal(pixels.find(({ rgba }) => rgba === `${channels(strong).join(',')},1`).count, 2, `${scheme}: canonical and avatar both paint the strong colour`);
    }
  } finally { await browser.close(); }
});

test('Storybook colour audit leaves a served image unverified even when its Content-DPR header shrinks its size', async () => {
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  let server;
  try {
    const page = await browser.newPage();
    const pale = graphs.light['reference.color.bluegreen-20'].value;
    const [red, green, blue] = [1, 3, 5].map((start) => Number.parseInt(pale.slice(start, start + 2), 16));
    // The same off-palette checkerboard as the srcset case: each 2 by 2 block averages back to the pale colour.
    const png = Buffer.from(await page.evaluate(({ red, green, blue }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const context = canvas.getContext('2d');
      for (let index = 0; index < 256; index += 1) {
        const [x, y] = [index % 16, Math.floor(index / 16)];
        context.fillStyle = `rgb(${red + ((x + y) % 2 ? -8 : 8)}, ${green}, ${blue})`;
        context.fillRect(x, y, 1, 1);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, { red, green, blue }), 'base64');
    // Served from the page's own origin, so the canvas is not tainted and only the header can change the size.
    server = createHttpServer((request, response) => {
      if (request.url === '/checker.png') response.writeHead(200, { 'content-type': 'image/png', 'content-dpr': '2' }).end(png);
      else response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><img id="served" width="16" height="16" src="/checker.png">');
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#served').evaluate((image) => image.decode());
    assert.equal(await page.locator('#served').evaluate((image) => image.naturalWidth), 8, 'Content-DPR halves the reported size');
    const report = await page.evaluate(collectStorybookPaints, { tokens: graphs.light });
    assert.ok(report.media.some((source) => source.endsWith('/checker.png')), 'the served image stays unverified media');
    assert.deepEqual(report.paints.filter(({ property }) => property === 'image-pixel'), []);
  } finally {
    await browser.close();
    server?.close();
  }
});

test('Storybook colour audit accepts dynamic color data only on marked Mux paint parts', async () => {
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  try {
    const page = await browser.newPage();
    const tokens = graphs.light;
    await page.setContent(`<html><body style="color:${tokens['semantic.content.strong'].value};background:${tokens['semantic.surface.canvas'].value}">
      <div id="area" class="muxui-color-area" data-muxui-color-paint="area" style="width:40px;height:24px;background-image:linear-gradient(rgb(1,2,3),rgb(4,5,6));background-color:rgb(55,56,57);background-blend-mode:screen;border:1px solid rgb(7,8,9);outline:1px solid rgb(49,50,51);box-shadow:0 0 2px rgb(52,53,54)"><span id="area-text" style="color:rgb(10,11,12)">label</span></div>
      <div id="area-thumb" class="muxui-color-area__thumb" data-muxui-color-paint="sample" style="width:12px;height:12px;background-color:rgb(13,14,15)"></div>
      <div id="slider-track" class="muxui-color-slider__track" data-muxui-color-paint="track" style="width:40px;height:8px;background-image:linear-gradient(rgb(16,17,18),rgb(19,20,21))"></div>
      <div id="slider-thumb" class="muxui-color-slider__thumb-face" data-muxui-color-paint="sample" style="width:12px;height:12px;background-color:rgb(22,23,24)"></div>
      <div id="wheel-track" class="muxui-color-wheel__track" data-muxui-color-paint="track" style="width:40px;height:40px;background-image:conic-gradient(rgb(25,26,27),rgb(28,29,30))"></div>
      <div id="wheel-thumb" class="muxui-color-wheel__thumb-face" data-muxui-color-paint="sample" style="width:12px;height:12px;background-color:rgb(31,32,33)"></div>
      <div id="swatch" class="muxui-color-swatch" data-muxui-color-paint="sample" style="width:16px;height:16px;background-color:rgb(34,35,36);background-image:linear-gradient(rgb(37,38,39),rgb(40,41,42))"></div>
      <div id="theme-swatch" class="muxui-theme-picker__swatch" data-muxui-color-paint="sample" style="width:16px;height:16px;background-color:rgb(49,50,51);border:1px solid rgb(52,53,54)"></div>
      <div id="unowned-marker" data-muxui-color-paint="area" style="width:24px;height:16px;background-image:linear-gradient(rgb(43,44,45),rgb(46,47,48))"></div>
      <div id="wrong-blend" class="muxui-color-area" data-muxui-color-paint="area" style="width:24px;height:16px;background-blend-mode:multiply;mix-blend-mode:screen"></div>
    </body></html>`);

    const result = await page.evaluate(collectStorybookPaints, { tokens });
    assert.deepEqual(result.media, []);
    assert.ok(result.problems.some(({ element, property }) => element.includes('#wrong-blend') && property === 'background-blend-mode'));
    assert.ok(result.problems.some(({ element, property }) => element.includes('#wrong-blend') && property === 'mix-blend-mode'));
    const unowned = (id, property) => result.nonToken.some((paint) => paint.property === property
      && paint.examples.some((example) => example.includes(`#${id}`)));
    assert.ok(unowned('area', 'border-top-color'), 'component borders remain token-audited');
    assert.ok(unowned('area', 'outline-color'), 'focus paint remains token-audited');
    assert.ok(unowned('area', 'box-shadow'), 'shadows remain token-audited');
    assert.ok(unowned('area-text', 'color'), 'ordinary descendant text remains token-audited');
    assert.ok(unowned('unowned-marker', 'background-image'), 'a marker without the owned part cannot opt out');
    assert.ok(!result.nonToken.some((paint) => ['background-color', 'background-image'].includes(paint.property)
      && ['area', 'area-thumb', 'slider-track', 'slider-thumb', 'wheel-track', 'wheel-thumb', 'swatch', 'theme-swatch']
        .some((id) => paint.examples.some((example) => example.includes(`#${id}`)))), JSON.stringify(result.nonToken));
    assert.ok(unowned('theme-swatch', 'border-top-color'), 'a theme swatch border remains token-audited');
  } finally {
    await browser.close();
  }
});

test('Storybook colour audit recognizes canonical token mixes and shadow-only focus opacity', async () => {
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  try {
    const page = await browser.newPage();
    const tokens = graphs.dark;
    const derived = tokens['semantic.color.neutral-5'];
    const source = tokens[derived.mix.token];
    const focusGlow = tokens['semantic.focus.neutral-glow'];
    const datePopover = tokens['component.datepicker.popover-shadow-color'];
    const datePopoverSource = tokens[datePopover.mix.token];
    const datePopoverColor = datePopoverSource.value.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu).slice(1)
      .map((channel) => Number.parseInt(channel, 16));
    const datePopoverMix = `color-mix(in ${datePopover.mix.space}, ${datePopoverSource.value} ${datePopover.mix.weight * 100}%, ${datePopover.mix.color})`;
    const baseStyles = await readFile(resolve(appRoot, '../../packages/react/src/styles/base.css'), 'utf8');
    const supplementalStyles = await readFile(resolve(appRoot, '../../packages/react/src/supplemental/styles.css'), 'utf8');
    assert.match(baseStyles, /--muxui-focus-ring-glow:\s*color-mix\(in srgb, var\(--muxui-semantic-focus-neutral-glow\) 30%, transparent\)/u);
    assert.match(supplementalStyles, /--muxui-focus-ring-glow:\s*color-mix\(in srgb, var\(--muxui-semantic-color-neutral-60\) 30%, transparent\)/u);
    await page.setContent(`<html data-muxui-color-scheme="dark"><body style="color:${tokens['semantic.content.strong'].value};background:${tokens['semantic.surface.canvas'].value}"><div style="width:80px;height:24px;background:color-mix(in ${derived.mix.space}, ${source.value} ${derived.mix.weight * 100}%, ${derived.mix.color})">Derived field surface</div><div id="focus-glow" style="width:80px;height:24px;box-shadow:0 0 1px color-mix(in srgb, ${focusGlow.value} 30%, transparent)">Canonical focus opacity</div><div id="date-popover-color" style="width:80px;height:24px;box-shadow:0 4px 16px ${datePopoverMix}">Token-backed date popover shadow color</div><div id="nearby-shadow" style="width:80px;height:24px;box-shadow:0 0 1px rgba(${datePopoverColor.join(',')},0.11)">Unowned nearby shadow alpha</div><div id="unowned-mix" style="width:80px;height:24px;background:color-mix(in srgb, rgb(1,2,3) 30%, transparent)">Unowned mix</div><div id="focus-background" style="width:80px;height:24px;background:color-mix(in srgb, ${focusGlow.value} 30%, transparent)">Focus mix is not a palette paint</div></body></html>`);
    const result = await page.evaluate(collectStorybookPaints, { tokens });
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.nonToken.length, 3);
    assert.ok(result.nonToken.some(({ examples }) => examples.some((example) => example.includes('#nearby-shadow'))));
    assert.ok(result.nonToken.some(({ examples }) => examples.some((example) => example.includes('#unowned-mix'))));
    assert.ok(result.nonToken.some(({ examples }) => examples.some((example) => example.includes('#focus-background'))));
    assert.ok(result.paints.some(({ property, rgba, token }) => property === 'background-color'
      && rgba === '14.45,13.6,12.75,1' && tokens[token]?.mix), JSON.stringify(result.paints));
    assert.ok(result.paints.some(({ property, rgba, token }) => property === 'box-shadow'
      && rgba.endsWith(',0.3') && [focusGlow.id, tokens['semantic.color.neutral-60'].id].includes(token)), JSON.stringify(result.paints));
    assert.ok(result.paints.some(({ property, rgba, token }) => property === 'box-shadow'
      && rgba.endsWith(',0.1') && token === datePopover.id), JSON.stringify(result.paints));
  } finally {
    await browser.close();
  }
});

test('Storybook colour audit reads a nested colour scheme scope against its own scheme\'s tokens', async () => {
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  try {
    const page = await browser.newPage();
    // A mix of a token whose value differs by scheme, so only the dark graph holds this colour.
    const derived = graphs.dark['semantic.color.neutral-5'];
    const source = graphs.dark[derived.mix.token];
    const mix = `color-mix(in ${derived.mix.space}, ${source.value} ${derived.mix.weight * 100}%, ${derived.mix.color})`;
    const html = (inside, outside = '') => `<html data-muxui-color-scheme="light"><body style="color:${graphs.light['semantic.content.strong'].value};background:${graphs.light['semantic.surface.canvas'].value}">
      ${outside}<div data-muxui-color-scheme="dark" style="width:40px;height:24px;background:${inside}"><span id="nested-child" style="background:${inside}">x</span></div>
    </body></html>`;
    const flagged = (result) => result.nonToken.filter((paint) => paint.property === 'background-color' && paint.rgba === '14.45,13.6,12.75,1');

    await page.setContent(html(mix));
    assert.equal(flagged(await page.evaluate(collectStorybookPaints, { tokens: graphs.light })).length, 1, 'the light graph alone does not hold a dark mix');
    const nested = await page.evaluate(collectStorybookPaints, { tokens: graphs.light, schemeTokens: graphs });
    assert.deepEqual(flagged(nested), [], 'inside a dark scope the dark graph applies, for the scope and its descendants');
    assert.ok(nested.paints.some(({ property, rgba, token }) => property === 'background-color' && rgba === '14.45,13.6,12.75,1' && graphs.dark[token]?.mix), JSON.stringify(nested.paints));

    // The same colour on the light page itself, outside the scope, is still off the page's tokens.
    await page.setContent(html('transparent', `<div id="outside" style="width:40px;height:24px;background:${mix}"></div>`));
    const outside = await page.evaluate(collectStorybookPaints, { tokens: graphs.light, schemeTokens: graphs });
    assert.equal(flagged(outside).length, 1);
    assert.ok(flagged(outside)[0].examples.some((example) => example.includes('#outside')));
  } finally {
    await browser.close();
  }
});

test('Storybook colour audit preserves intrinsic alpha in canonical effect paints', async () => {
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  try {
    const page = await browser.newPage();
    const effect = structuredClone(graphs.light['semantic.elevation.indicator']);
    const effectId = 'semantic.test.intrinsic-alpha-shadow';
    effect.id = effectId;
    effect.value.layers[0].color = { value: '#173b5d80' };
    const tokens = { ...graphs.light, [effectId]: effect };
    await page.setContent(`<html><body style="color:${tokens['semantic.content.strong'].value};background:${tokens['semantic.surface.canvas'].value}">
      <div id="intrinsic-alpha" style="width:40px;height:24px;box-shadow:0 1px 2px #173b5d80"></div>
      <div id="different-alpha" style="width:40px;height:24px;box-shadow:0 1px 2px #173b5db3"></div>
    </body></html>`);

    const result = await page.evaluate(collectStorybookPaints, { tokens });
    assert.deepEqual(result.problems, []);
    const shadowFor = (id) => result.paints.find((paint) => paint.property === 'box-shadow'
      && paint.examples.some((example) => example.includes(`#${id}`)));
    const intrinsicAlpha = shadowFor('intrinsic-alpha');
    const differentAlpha = shadowFor('different-alpha');
    assert.equal(intrinsicAlpha?.token, effectId, JSON.stringify(result.paints));
    assert.notEqual(differentAlpha?.token, effectId, 'different alpha must not match the effect color');
    assert.ok(result.nonToken.some((paint) => paint.property === 'box-shadow'
      && paint.examples.some((example) => example.includes('#different-alpha'))));

    const toastEffect = tokens['semantic.elevation.toast'];
    await page.evaluate(() => {
      const fractionalAlpha = document.createElement('div');
      fractionalAlpha.id = 'fractional-effect-alpha';
      fractionalAlpha.style.cssText = 'width:40px;height:24px;box-shadow:0 1px 2px rgba(0,0,0,0.105)';
      const differentFraction = document.createElement('div');
      differentFraction.id = 'different-fractional-effect-alpha';
      differentFraction.style.cssText = 'width:40px;height:24px;box-shadow:0 1px 2px rgba(0,0,0,0.11)';
      document.body.append(fractionalAlpha, differentFraction);
    });
    const fractionalResult = await page.evaluate(collectStorybookPaints, { tokens });
    const fractionalShadow = fractionalResult.paints.find((paint) => paint.property === 'box-shadow'
      && paint.examples.some((example) => example.includes('#fractional-effect-alpha')));
    assert.equal(fractionalShadow?.token, toastEffect.id, JSON.stringify(fractionalResult.paints));
    assert.ok(fractionalResult.nonToken.some((paint) => paint.property === 'box-shadow'
      && paint.examples.some((example) => example.includes('#different-fractional-effect-alpha'))));
  } finally {
    await browser.close();
  }
});

test('Storybook colour declarations reference Mux tokens, including values that happen to match the palette', async () => {
  const browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
  try {
    const page = await browser.newPage();
    const css = [managerThemeCss(), previewThemeCss(), await readFile(resolve(appRoot, '.storybook/preview.css'), 'utf8')];
    const known = [...new Set(Object.values(graphs).flatMap((graph) => Object.values(graph)
      .filter((token) => token.type === 'color').map((token) => token.value)))];
    const otherValues = Object.values(graphs).flatMap((graph) => Object.values(graph)
      .filter((token) => token.type !== 'color').map((token) => String(token.value)));
    const variables = [...new Set(Object.values(graphs).flatMap((graph) => Object.values(graph)
      .filter((token) => token.type === 'color').map(({ id }) => `--muxui-${id.replaceAll('.', '-')}`)))];
    const result = await page.evaluate(({ css, known, otherValues, variables }) => {
      const declared = new Set(variables);
      const errors = [];
      const sheets = css.map((text) => { const sheet = new CSSStyleSheet(); sheet.replaceSync(text); return sheet; });
      const rules = sheets.flatMap((sheet) => [...sheet.cssRules]).filter((rule) => rule.style);
      for (const rule of rules) for (const property of rule.style) if (property.startsWith('--muxui-')) {
        const value = rule.style.getPropertyValue(property).trim();
        if (known.includes(value)) declared.add(property);
        else if (!otherValues.includes(value)) errors.push(`Unowned variable: ${property}`);
      }
      function audit(property, value) {
        if (!/^(?:color|(?:background|border|outline)(?:-(?:color|image|top|right|bottom|left|top-color|right-color|bottom-color|left-color))?|(?:box|text)-shadow|(?:-webkit-)?text-(?:fill|stroke|decoration)-color|fill|stroke|caret-color|accent-color|scrollbar-color|stop-color|flood-color|lighting-color|filter|backdrop-filter)$/u.test(property)) return [];
        const issues = [];
        // CSSOM expands a transparent background shorthand to an initial image (none).
        if (property === 'background-image' && value === 'initial') return issues;
        const neutral = new Set(['none', 'transparent', 'currentcolor', 'inherit', 'auto']);
        const rest = value.replace(/var\((--[\w-]+)\)/gu, (_, name) => {
          if (!declared.has(name)) issues.push(`Unknown token ${name}`);
          return '';
        });
        if (/#(?:[a-f\d]{3,8})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/iu.test(rest)) issues.push('Literal or generated colour');
        for (const word of rest.match(/[a-z-]+/giu) ?? []) {
          if (CSS.supports('color', word) && !neutral.has(word.toLowerCase())) issues.push(`Literal colour ${word}`);
        }
        return issues;
      }
      for (const rule of rules) for (const property of rule.style) {
        for (const issue of audit(property, rule.style.getPropertyValue(property))) errors.push(`${rule.selectorText} ${property}: ${issue}`);
      }
      return { errors, declarations: rules.reduce((sum, rule) => sum + rule.style.length, 0),
        literalNegativeControl: audit('color', known[0]) };
    }, { css, known, otherValues, variables });
    assert.ok(result.declarations > 0);
    assert.deepEqual(result.errors, []);
    assert.ok(result.literalNegativeControl.length, 'A literal matching a token must still fail provenance');
    for (const [scheme, option] of Object.entries(backgroundOptions())) {
      assert.equal(option.value, graphs[scheme]['semantic.surface.canvas'].value);
    }
    for (const scheme of ['light', 'dark']) {
      const theme = buildTheme(scheme);
      for (const [field, value] of Object.entries(theme)) {
        if (/(?:color|bg)$/iu.test(field)) assert.ok(known.includes(value), `${scheme}: ${field} must resolve from the canonical graph`);
      }
    }
  } finally { await browser.close(); }
});

test('Storybook canvas palette adapter rejects upstream drift and removes generated alpha', async () => {
  const source = await readFile(new URL(import.meta.resolve('storybook/internal/preview/runtime')), 'utf8');
  const projected = projectMeasurePalette(source);
  assert.ok(!projected.includes('`${colors[type5]}dd`'));
  assert.throws(() => projectMeasurePalette(source.replace('#f6b26b', '#123456')), /palette changed/u);
  assert.throws(() => projectMeasurePalette(source.replaceAll('`${colors[type5]}dd`', 'colors[type5]')), /label alpha changed/u);
});
