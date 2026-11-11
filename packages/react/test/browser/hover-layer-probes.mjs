import assert from 'node:assert/strict';
import { recordFrames } from '../fixtures/frame-recorder.mjs';

// Probes shared by the browser tests of the moving hover layer in Tabs and ToggleButtonGroup. A
// subject names the layer and its items by selector: { page, layer: '#id .layer', items: '#id .item' }.
// The pointer is the real `page.mouse`, so each probe exercises React Aria's hover state too.

const SETTLED = 0.05;
const NEAR = 0.75;
const CLEAR = 'rgba(0, 0, 0, 0)';

// Serialized into the page by recordFrames, so it must stay self-contained.
function sampleLayer(layerSelector) {
  const node = document.querySelector(layerSelector);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, opacity: Number(getComputedStyle(node).opacity) };
}

/** The viewport box of item `index`. */
export async function itemBox(subject, index) {
  const box = await subject.page.locator(subject.items).nth(index).boundingBox();
  assert.ok(box, `${subject.items}[${index}] is visible`);
  return { left: box.x, top: box.y, width: box.width, height: box.height };
}

/** Puts the real pointer on the centre of item `index` and returns its box. */
export async function pointOnto(subject, index) {
  const box = await itemBox(subject, index);
  await subject.page.mouse.move(box.left + (box.width / 2), box.top + (box.height / 2));
  return box;
}

/** Lets two frames paint, so a recording has sampled the state a wait just saw. */
async function twoFrames(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** Waits until the layer is fully visible and rests on item `index` to within `tolerance` pixels. */
export async function settledOn(subject, index, tolerance = SETTLED) {
  await subject.page.waitForFunction(({ layer, items, at, limit }) => {
    const node = document.querySelector(layer);
    const item = document.querySelectorAll(items)[at];
    if (!node || !item || Number(getComputedStyle(node).opacity) < 0.99) return false;
    const a = node.getBoundingClientRect();
    const b = item.getBoundingClientRect();
    return ['left', 'top', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) < limit);
  }, { layer: subject.layer, items: subject.items, at: index, limit: tolerance });
}

/** Waits until the layer has faded out and kept no box, which would otherwise widen a scrollable host. */
export async function faded(subject) {
  await subject.page.waitForFunction((layer) => {
    const node = document.querySelector(layer);
    return Number(getComputedStyle(node).opacity) < 0.01 && node.style.width === '0px' && node.style.height === '0px';
  }, subject.layer);
}

/** Waits until the layer has been told to fade, whether or not it has finished. */
export async function fading(subject) {
  await subject.page.waitForFunction((layer) => document.querySelector(layer).style.opacity === '0', subject.layer);
}

/** Nothing runs while the layer rests: no animation on it, and no animation frame requested. */
export async function assertIdle(subject, message) {
  await subject.page.waitForFunction((layer) => document.querySelector(layer).getAnimations().length === 0, subject.layer);
  const requested = await subject.page.evaluate(() => new Promise((resolve) => {
    let calls = 0;
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      calls += 1;
      return original.call(window, callback);
    };
    // Negative check: a loop would request a frame within this window, and there is no event to await.
    setTimeout(() => {
      window.requestAnimationFrame = original;
      resolve(calls);
    }, 150);
  }));
  assert.equal(requested, 0, `${message}: no animation frame is requested while idle`);
}

/** Forced colors hide the layer and leave hover to the item. */
export async function assertHiddenInForcedColors(subject, message) {
  await subject.page.emulateMedia({ forcedColors: 'active' });
  const display = await subject.page.locator(subject.layer).evaluate((node) => getComputedStyle(node).display);
  await subject.page.emulateMedia({ forcedColors: 'none' });
  assert.equal(display, 'none', message);
}

/** Item `index` paints no fill of its own: the layer owns its hover. */
export async function assertFillClear(subject, index, message) {
  const fill = await subject.page.locator(subject.items).nth(index).evaluate((node) => getComputedStyle(node).backgroundColor);
  assert.equal(fill, CLEAR, message);
}

/** The layer paints `color`, a CSS value resolved where the layer is, so no colour is hard-coded. */
export async function assertLayerColor(subject, color, message) {
  const { painted, wanted } = await subject.page.locator(subject.layer).evaluate((node, value) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = value;
    node.parentElement.append(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { painted: getComputedStyle(node).backgroundColor, wanted: resolved };
  }, color);
  assert.notEqual(wanted, CLEAR, `${message}: the colour resolves`);
  assert.equal(painted, wanted, message);
}

/** Starts recording the layer; `stop()` returns its box and opacity on every frame since. */
export function recordLayer(subject) {
  return recordFrames(subject.page, sampleLayer, subject.layer);
}

const between = (frame, from, to) => frame.left > Math.min(from.left, to.left) + NEAR && frame.left < Math.max(from.left, to.left) - NEAR;

/** Moves item `from` to item `to` under the real pointer and returns the layer's frames on the way. */
export async function travel(subject, from, to) {
  await pointOnto(subject, from);
  await settledOn(subject, from);
  const recording = await recordLayer(subject);
  await pointOnto(subject, to);
  await settledOn(subject, to);
  await twoFrames(subject.page);
  return { frames: await recording.stop(), start: await itemBox(subject, from), end: await itemBox(subject, to) };
}

/**
 * The layer slid from `from` to `to` through an intermediate position, stayed fully visible
 * the whole way, and rests exactly on `to`.
 */
export function assertTravelled({ frames, start, end }, message) {
  assert.ok(frames.some((frame) => between(frame, start, end)), `${message}: an intermediate position is recorded ${JSON.stringify(frames)}`);
  assert.ok(frames.every((frame) => frame.opacity >= 0.99), `${message}: no flash or fade between items`);
  const last = frames.at(-1);
  for (const key of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(last[key] - end[key]) < SETTLED, `${message}: settles on the target ${key}`);
}

/** The layer jumped between `from` and `to`: no frame sits anywhere in between. */
export function assertJumped({ frames, start, end }, message) {
  assert.ok(frames.length > 0 && !frames.some((frame) => between(frame, start, end)), `${message}: no intermediate position ${JSON.stringify(frames)}`);
  assert.ok(Math.abs(frames.at(-1).left - end.left) < SETTLED, `${message}: ends on the target`);
}

/**
 * Leaves the group from item `from` and waits for the layer to fade out and give up its box, then
 * enters item `index`: there is nothing left to travel from, so the layer is placed on the item.
 */
export async function assertEntersInPlace(subject, from, index, message) {
  const stale = await pointOnto(subject, from);
  await settledOn(subject, from);
  await subject.page.mouse.move(0, 0);
  await faded(subject);
  const recording = await recordLayer(subject);
  const target = await pointOnto(subject, index);
  await settledOn(subject, index);
  await twoFrames(subject.page);
  assertJumped({ frames: await recording.stop(), start: stale, end: target }, message);
}

/**
 * Leaves the group from item `from`, then enters item `index` while the layer is still fading out:
 * it comes back to full opacity and travels from where it is. The fade is held long so the pointer
 * always arrives before it ends.
 */
export async function assertReentersFromFade(subject, from, index, message) {
  const layer = subject.page.locator(subject.layer);
  const start = await pointOnto(subject, from);
  await settledOn(subject, from);
  await layer.evaluate((node) => { node.style.transitionDuration = '2s'; });
  await subject.page.mouse.move(0, 0);
  await fading(subject);
  const recording = await recordLayer(subject);
  const end = await pointOnto(subject, index);
  await settledOn(subject, index);
  await layer.evaluate((node) => node.style.removeProperty('transition-duration'));
  await twoFrames(subject.page);
  const frames = await recording.stop();
  assert.ok(frames.some((frame) => between(frame, start, end)), `${message}: an intermediate position is recorded ${JSON.stringify(frames)}`);
  assert.ok(Math.abs(frames.at(-1).left - end.left) < SETTLED, `${message}: ends on the target`);
}

/**
 * The real pointer runs along the top edge of item `from` into the next item, through the place their
 * corners meet. Rounded corners must open no gap there: each item stays hovered right up to the join,
 * and the layer travels across it at full opacity.
 */
export async function assertCrossesCorners(subject, from, message) {
  const { page } = subject;
  const start = await itemBox(subject, from);
  const end = await itemBox(subject, from + 1);
  const y = start.top + 1;
  const hoveredAt = async (x) => {
    await page.mouse.move(x, y);
    await twoFrames(page);
    return page.locator(subject.items).evaluateAll((items) => items.findIndex((item) => item.hasAttribute('data-muxui-state-hovered')));
  };
  assert.equal(await hoveredAt(start.left + (start.width / 2)), from, `${message}: the first item is hovered along its top edge`);
  await settledOn(subject, from);
  const recording = await recordLayer(subject);
  assert.equal(await hoveredAt(start.left + start.width - 1), from, `${message}: the first item's corner still hovers it`);
  assert.equal(await hoveredAt(end.left + 1), from + 1, `${message}: the next item's corner hovers it`);
  await settledOn(subject, from + 1);
  await twoFrames(page);
  assertTravelled({ frames: await recording.stop(), start, end }, message);
}

/**
 * The real pointer goes from item `from` over the selected item `through` to item `to`. The layer stays
 * fully visible the whole way, rests exactly on the selected item's box while the pointer is there (under
 * its fill), and the move on to `to` records an intermediate position.
 */
export async function assertCrossesSelected(subject, from, through, to, message) {
  await pointOnto(subject, from);
  await settledOn(subject, from);
  const recording = await recordLayer(subject);
  const middle = await pointOnto(subject, through);
  await settledOn(subject, through);
  await twoFrames(subject.page);
  const end = await pointOnto(subject, to);
  await settledOn(subject, to);
  await twoFrames(subject.page);
  const frames = await recording.stop();
  assert.ok(frames.every((frame) => frame.opacity >= 0.99), `${message}: the layer stays visible the whole way ${JSON.stringify(frames)}`);
  const arrived = frames.findIndex((frame) => ['left', 'top', 'width', 'height'].every((key) => Math.abs(frame[key] - middle[key]) < SETTLED));
  assert.ok(arrived >= 0, `${message}: the layer settles on the selected item`);
  assert.ok(frames.slice(arrived).some((frame) => between(frame, middle, end)), `${message}: leaving the selected item records an intermediate position`);
  assert.ok(Math.abs(frames.at(-1).left - end.left) < SETTLED, `${message}: ends on the target`);
}

/** Moving onto a disabled item hides the layer where it was: it never goes near that item. */
export async function assertSkipsItem(subject, from, disabled, message) {
  await pointOnto(subject, from);
  await settledOn(subject, from);
  const recording = await recordLayer(subject);
  const skipped = await pointOnto(subject, disabled);
  await faded(subject);
  const frames = await recording.stop();
  assert.ok(frames.every((frame) => Math.abs(frame.left - skipped.left) > NEAR), `${message}: the layer never lands on the disabled item`);
  assert.equal(await subject.page.locator(subject.items).nth(disabled).evaluate((node) => node.hasAttribute('data-muxui-state-hovered')), false, `${message}: a disabled item is not hovered`);
}

/**
 * The layer gives up its box when no fade will ever end: a zero duration runs none, and hiding the
 * layer mid-fade cancels it. `setDuration` sets the state motion duration and is left at the long value.
 */
export async function assertParksWithoutFade(subject, setDuration, message) {
  await setDuration('0ms');
  await pointOnto(subject, 0);
  await settledOn(subject, 0);
  await subject.page.mouse.move(0, 0);
  await faded(subject);

  await pointOnto(subject, 0);
  await settledOn(subject, 0);
  await setDuration('10s');
  await subject.page.mouse.move(0, 0);
  await fading(subject);
  const box = subject.page.locator(subject.layer);
  assert.equal(await box.evaluate((node) => node.getAnimations().length), 1, `${message}: the layer is mid-fade`);
  await box.evaluate((node) => { node.style.display = 'none'; });
  await subject.page.waitForFunction((layer) => document.querySelector(layer).style.width === '0px', subject.layer);
  await box.evaluate((node) => node.style.removeProperty('display'));
}

/**
 * With item `index` held hovered, flipping the page direction moves the item and the layer follows.
 * The hover is forced: Chrome sends fake mouse moves after a layout change, which could end a real one.
 */
export async function assertFollowsDirection(subject, index, message) {
  const item = subject.page.locator(subject.items).nth(index);
  await subject.page.mouse.move(0, 0);
  await item.evaluate((node) => node.setAttribute('data-muxui-state-hovered', ''));
  await settledOn(subject, index);
  const before = await itemBox(subject, index);
  await subject.page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
  const after = await itemBox(subject, index);
  assert.ok(Math.abs(after.left - before.left) > NEAR, `${message}: the direction change moves the item`);
  await settledOn(subject, index);
  await subject.page.evaluate(() => document.documentElement.removeAttribute('dir'));
  await settledOn(subject, index);
  await item.evaluate((node) => node.removeAttribute('data-muxui-state-hovered'));
  await faded(subject);
}
