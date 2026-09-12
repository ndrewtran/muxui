import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { ControlSizingFixture } from '../fixtures/control-sizing-fixture.mjs';

const packageRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(packageRoot, '../..');
const sizes = Object.freeze({ sm: 32, md: 36, lg: 40 });
const compactRemoveMinimum = 24;
const sizeRows = Object.freeze(Object.keys(sizes));
const chromeCandidates = [
  process.env.MUXUI_CHROME_EXECUTABLE,
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const sizedTargets = Object.freeze({
  button: { selector: '.muxui-button' },
  'icon-button': { selector: '.muxui-button' },
  'text-field': { selector: '.muxui-field-input' },
  'text-field-invalid': { selector: '.muxui-field-input' },
  'search-field': { selector: '.muxui-field-input' },
  'number-field': { selector: '.muxui-number-control' },
  'date-field': { selector: '.muxui-date-input' },
  'time-field': { selector: '.muxui-date-input' },
  'date-picker': { selector: '.muxui-date-control' },
  'date-range-picker': { selector: '.muxui-date-range-control' },
  'combo-box': { selector: '.muxui-combo-control' },
  select: { selector: '.muxui-select-trigger' },
  autocomplete: { selector: '.muxui-field-input' },
  'command-palette': { selector: '.muxui-command-palette__trigger' },
  'color-field': { selector: '.muxui-field-input' },
  checkbox: { selector: '.muxui-checkbox' },
  'checkbox-group': { selector: '.muxui-checkbox' },
  'checkbox-group-md-child': { expectedHeight: sizes.md, selector: '.muxui-checkbox' },
  'checkbox-field': { selector: '.muxui-checkbox-field__button' },
  'radio-group': { selector: '.muxui-radio' },
  'radio-field': { selector: '.muxui-radio-field__button' },
  switch: { selector: '.muxui-switch' },
  'switch-field': { selector: '.muxui-switch-field__button' },
  input: { selector: '.muxui-input' },
  'input-native-size': { selector: '.muxui-input' },
  'input-tags': { anatomy: true, selector: '.muxui-input-tags__group' },
  'payment-input': { selector: '.muxui-payment-input__group' },
  'multi-select': { selector: '.muxui-multi-select__trigger-inner' },
  'tag-select': { anatomy: true, selector: '.muxui-tag-select__group' },
  'toggle-button': { selector: '.muxui-toggle-button' },
  tabs: { count: 2, selector: '.muxui-tab' },
});

const defaultTargets = Object.freeze({
  'option-default': { count: 1, selector: '.muxui-list-box-item' },
  'tree-default': { count: 2, selector: '.muxui-tree-item-content' },
  'toolbar-default': { count: 2, selector: '.muxui-toolbar > .muxui-button' },
  'color-mode-toggle-default': { count: 1, minHeight: sizes.md, selector: '.muxui-color-mode-toggle' },
  'header-nav-default': { count: 1, selector: '.muxui-header-nav__nav-btn' },
  'sidebar-search-default': { count: 1, selector: '.muxui-sidebar__search-input' },
  'sidebar-account-trigger-default': { count: 1, selector: '.muxui-sidebar__account-trigger' },
  'sidebar-feature-dismiss-default': { count: 1, selector: '.muxui-sidebar__feature-card-dismiss' },
  'table-default': { count: 1, selector: '.muxui-table-row' },
});

const compactInteractiveTargets = Object.freeze({
  'input-tags': '.muxui-input-tags__tag',
  'tag-select': '.muxui-tag-select__tag-remove',
});

const portalTargets = Object.freeze({
  'combo-box': {
    listSelector: '.muxui-combo-box-list',
    opener: '.muxui-combo-box-trigger',
    optionSelector: '.muxui-combo-box-option',
    expectedCount: 2,
  },
  select: {
    listSelector: '.muxui-select-list',
    opener: '.muxui-select-trigger',
    optionSelector: '.muxui-select-option',
    expectedCount: 2,
  },
  'multi-select': {
    listSelector: '.muxui-multi-select__listbox',
    opener: '.muxui-multi-select__trigger',
    optionSelector: '.muxui-multi-select__item',
    expectedCount: 2,
  },
  'tag-select': {
    listSelector: '.muxui-tag-select__listbox',
    opener: '.muxui-tag-select__input',
    optionSelector: '.muxui-tag-select__item',
    expectedCount: 2,
    focusOnly: true,
  },
});

async function chromePath() {
  for (const path of chromeCandidates) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next installed browser.
    }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for sizing verification.');
}

async function waitForFixtureHydrated(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute('data-control-sizing-hydrated') === 'true', undefined, { timeout: 5_000 });
}

async function waitForTimeFieldsMounted(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute('data-control-sizing-time-fields-mounted') === 'true'
    && ['sm', 'md', 'lg'].every((size) => document.querySelector(
      `[data-size-row="${size}"] [data-control-id="time-field"] .muxui-date-input`,
    )), undefined, { timeout: 5_000 });
}

async function waitForScrollSettled(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function focusAfterScroll(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await waitForScrollSettled(page);
  await locator.focus({ preventScroll: true });
}

async function clickAfterScroll(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await waitForScrollSettled(page);
  await locator.click();
}

function fixtureDocument() {
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(ControlSizingFixture)));
  return `<!doctype html><html data-muxui-color-scheme="light" data-muxui-density="comfortable"><head><meta charset="utf-8"><link rel="icon" href="data:,control-sizing"><link rel="stylesheet" href="/packages/react/generated/styles.css"><link rel="stylesheet" href="/packages/react/generated/supplemental.css"><style>
    :root { color-scheme: light; }
    html[data-muxui-color-scheme='dark'] { color-scheme: dark; }
    body { box-sizing: border-box; min-width: 1240px; margin: 24px; background: var(--muxui-semantic-surface-canvas, #fff); color: var(--muxui-semantic-content-strong, #111); font-family: Inter, system-ui, sans-serif; font-size: 16px; }
    #control-sizing-fixture { display: grid; gap: 32px; }
    .sizing-grid { display: grid; gap: 32px; }
    [data-size-row] { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: start; gap: 20px 16px; }
    [data-size-row] > h2 { grid-column: 1 / -1; margin: 0; font-size: 16px; line-height: 1.25; }
    .sizing-case { min-width: 0; }
    [data-default-controls] { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; gap: 16px; }
    [data-text-scale='200'] .sizing-case[data-control-id='button'] .muxui-button,
    [data-text-scale='200'] .sizing-case[data-control-id='text-field'] .muxui-field-input { font-size: 32px; }
    [data-text-scale='200'] .sizing-case[data-control-id='button'] .muxui-button,
    [data-text-scale='200'] .sizing-case[data-control-id='text-field'] .muxui-field-input { line-height: 1.5; }
    :root[data-test-spacing='wide'] { --muxui-component-button-padding-inline: 40px; }
  </style></head><body>${body}<script type="module" src="/packages/react/test/fixtures/control-sizing-browser-entry.mjs"></script></body></html>`;
}

async function startServer() {
  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    logLevel: 'error',
    optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'lucide-react'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{
      name: 'control-sizing-fixture-document',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/control-sizing.html') {
            response.statusCode = 200;
            response.setHeader('content-type', 'text/html');
            response.end(fixtureDocument());
            return;
          }
          next();
        });
      },
    }],
  });
  await server.listen();
  const address = server.httpServer.address();
  assert.equal(typeof address, 'object');
  assert.ok(address?.port);
  return { server, url: `http://127.0.0.1:${address.port}/control-sizing.html` };
}

async function measureTargets(page, rowSelector, targets) {
  return page.evaluate(({ rowSelector: selector, targets: targetSpecs }) => {
    const row = document.querySelector(selector);
    if (!row) throw new Error(`Missing control sizing row: ${selector}`);
    return Object.fromEntries(Object.entries(targetSpecs).map(([id, spec]) => {
      const controlCase = row.querySelector(`[data-control-id="${id}"]`);
      const nodes = controlCase ? [...controlCase.querySelectorAll(spec.selector)] : [];
      return [id, {
        count: nodes.length,
        nodes: nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          const measurement = {
            clientHeight: node.clientHeight,
            clientWidth: node.clientWidth,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            height: rect.height,
            lineHeight: style.lineHeight,
            minBlockSize: style.minBlockSize,
            overflow: style.overflow,
            padding: style.padding,
            paddingBlock: style.paddingBlock,
            borderBlockEndWidth: style.borderBlockEndWidth,
            borderBlockStartWidth: style.borderBlockStartWidth,
            boxSizing: style.boxSizing,
            alignItems: style.alignItems,
            gap: style.gap,
            scrollHeight: node.scrollHeight,
            scrollWidth: node.scrollWidth,
            selector: spec.selector,
            width: rect.width,
          };
          if (spec.anatomy) {
            const visualChildren = [];
            const collectVisualChildren = (parent) => {
              for (const child of parent.children) {
                if (child.tagName === 'TEMPLATE') continue;
                if (getComputedStyle(child).display === 'contents') collectVisualChildren(child);
                else visualChildren.push(child);
              }
            };
            collectVisualChildren(node);
            for (const child of node.querySelectorAll('input, button, [role="row"]')) {
              if (!visualChildren.includes(child)) visualChildren.push(child);
            }
            measurement.children = visualChildren.map((child) => {
              const childRect = child.getBoundingClientRect();
              const childStyle = getComputedStyle(child);
              return {
                className: child.className,
                tagName: child.tagName,
                height: childRect.height,
                width: childRect.width,
                fontFamily: childStyle.fontFamily,
                fontSize: childStyle.fontSize,
                fontWeight: childStyle.fontWeight,
                lineHeight: childStyle.lineHeight,
                minBlockSize: childStyle.minBlockSize,
                padding: childStyle.padding,
                borderBlockEndWidth: childStyle.borderBlockEndWidth,
                borderBlockStartWidth: childStyle.borderBlockStartWidth,
                boxSizing: childStyle.boxSizing,
                alignItems: childStyle.alignItems,
                gap: childStyle.gap,
              };
            });
          }
          return measurement;
        }),
      }];
    }));
  }, { rowSelector, targets });
}

async function measureAlertDialogCloseCases(page) {
  return page.evaluate(() => Object.fromEntries([
    ['text', '.control-sizing-alert-dialog-close-text'],
    ['icon', '.control-sizing-alert-dialog-close-icon'],
  ].map(([id, selector]) => {
    const node = document.querySelector(selector);
    if (!node) return [id, null];
    const rect = node.getBoundingClientRect();
    return [id, {
      className: node.className,
      clientHeight: node.clientHeight,
      clientWidth: node.clientWidth,
      height: rect.height,
      scrollHeight: node.scrollHeight,
      scrollWidth: node.scrollWidth,
      width: rect.width,
    }];
  })));
}

async function measureAutocompleteOptions(page, size) {
  return page.evaluate((targetSize) => {
    const list = document.querySelector(`.muxui-autocomplete-list[data-size="${targetSize}"]`);
    const nodes = list ? [...list.querySelectorAll('.muxui-autocomplete-option')] : [];
    return {
      count: nodes.length,
      lists: [...document.querySelectorAll('.muxui-autocomplete-list')].map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return {
          ariaHidden: candidate.getAttribute('aria-hidden'),
          dataEntering: candidate.getAttribute('data-entering'),
          dataExiting: candidate.getAttribute('data-exiting'),
          dataSize: candidate.getAttribute('data-size'),
          display: style.display,
          hidden: candidate.hidden,
          height: rect.height,
          visibility: style.visibility,
          width: rect.width,
        };
      }),
      roots: [...document.querySelectorAll('.muxui-autocomplete')].map((root) => {
        const input = root.querySelector('.muxui-field-input');
        const rect = root.getBoundingClientRect();
        return {
          active: document.activeElement === input,
          ariaExpanded: input?.getAttribute('aria-expanded'),
          inputDataFocusVisible: input?.getAttribute('data-focus-visible'),
          inputDataFocused: input?.getAttribute('data-focused'),
          inputDataFocusWithin: input?.getAttribute('data-focus-within'),
          inputHidden: input?.hidden,
          inputMatchesFocus: input?.matches(':focus'),
          inputTabIndex: input?.getAttribute('tabindex'),
          rootDataFocusVisible: root.getAttribute('data-focus-visible'),
          rootDataFocused: root.getAttribute('data-focused'),
          rootDataFocusWithin: root.getAttribute('data-focus-within'),
          dataSize: root.getAttribute('data-size'),
          height: rect.height,
          inputValue: input?.value,
          width: rect.width,
        };
      }),
      nodes: nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          fontSize: style.fontSize,
          height: rect.height,
          minBlockSize: style.minBlockSize,
          paddingBlock: style.paddingBlock,
          scrollHeight: node.scrollHeight,
          width: rect.width,
        };
      }),
    };
  }, size);
}

async function measureCompactInteractiveTargets(page, size) {
  return page.evaluate(({ targetSize, selectors }) => Object.fromEntries(Object.entries(selectors).map(([id, selector]) => {
    const row = document.querySelector(`[data-size-row="${targetSize}"]`);
    const controlCase = row?.querySelector(`[data-control-id="${id}"]`);
    const nodes = controlCase ? [...controlCase.querySelectorAll(selector)] : [];
    return [id, nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        height: rect.height,
        minBlockSize: style.minBlockSize,
        width: rect.width,
      };
    })];
  })), { targetSize: size, selectors: compactInteractiveTargets });
}

async function measureTableCells(page) {
  return page.evaluate(() => {
    const controlCase = document.querySelector('[data-default-controls] [data-control-id="table-default"]');
    const nodes = controlCase ? [...controlCase.querySelectorAll('.muxui-table-cell')] : [];
    return nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { height: rect.height, scrollHeight: node.scrollHeight, width: rect.width };
    });
  });
}

function collectTableCellFailures(measurements, label, failures) {
  if (measurements.length !== 2) {
    failures.push(`${label}/table-default cells locator count ${measurements.length}, expected 2`);
    return;
  }
  for (const node of measurements) {
    if (!(node.height >= sizes.md && node.width > 0)) failures.push(
      `${label}/table-default cell rendered ${node.width}x${node.height}px, expected at least ${sizes.md}px high`,
    );
    if (node.scrollHeight > node.height + 1) failures.push(
      `${label}/table-default cell text is vertically clipped: scrollHeight ${node.scrollHeight}px, client height ${node.height}px`,
    );
  }
}

async function measureCommandPaletteInput(page, size) {
  return page.evaluate((targetSize) => {
    const input = document.querySelector(`[aria-label="Command search ${targetSize}"]`);
    const items = [...document.querySelectorAll('.muxui-command-palette__item')].map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        fontSize: style.fontSize,
        height: rect.height,
        minBlockSize: style.minBlockSize,
        paddingBlock: style.paddingBlock,
        scrollHeight: node.scrollHeight,
        width: rect.width,
      };
    });
    if (!input) return { chipRemove: [], count: 0, items, nodes: [] };
    const rect = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    const chipRemove = [...document.querySelectorAll(`[aria-label="Remove recent ${targetSize}"]`)].map((node) => {
      const buttonRect = node.getBoundingClientRect();
      return { height: buttonRect.height, width: buttonRect.width };
    });
    return {
      chipRemove,
      count: 1,
      items,
      nodes: [{
        fontSize: style.fontSize,
        height: rect.height,
        minBlockSize: style.minBlockSize,
        scrollHeight: input.scrollHeight,
        width: rect.width,
      }],
    };
  }, size);
}

function collectCommandPaletteFailures(measurements, expectedHeight, size, failures) {
  if (measurements.count !== 1) {
    failures.push(`command-palette/${size}/input locator count ${measurements.count}, expected 1`);
    return;
  }
  const [node] = measurements.nodes;
  if (!(node.height > 0 && node.width > 0)) failures.push(`command-palette/${size}/input has zero geometry`);
  if (Math.abs(node.height - expectedHeight) >= 0.01) failures.push(
    `command-palette/${size}/input rendered ${node.height}px, expected ${expectedHeight}px; min-block-size ${node.minBlockSize}, font-size ${node.fontSize}`,
  );
  if (node.scrollHeight > node.height + 1) failures.push(`command-palette/${size}/input text is vertically clipped`);
  if (measurements.chipRemove.length !== 1) {
    failures.push(`compact/command-palette/${size}/chip-remove locator count ${measurements.chipRemove.length}, expected 1`);
  } else {
    const [remove] = measurements.chipRemove;
    if (remove.width < compactRemoveMinimum || remove.height < compactRemoveMinimum) failures.push(
      `compact/command-palette/${size}/chip-remove rendered ${remove.width}x${remove.height}px, expected at least ${compactRemoveMinimum}px in both axes`,
    );
  }
  if (measurements.items.length !== 1) {
    failures.push(`command-palette/${size}/item locator count ${measurements.items.length}, expected 1`);
  } else {
    const [item] = measurements.items;
    if (!(item.height > 0 && item.width > 0)) failures.push(`command-palette/${size}/item has zero geometry`);
    if (Math.abs(item.height - expectedHeight) >= 0.01) failures.push(
      `command-palette/${size}/item rendered ${item.height}px, expected ${expectedHeight}px; min-block-size ${item.minBlockSize}, `
      + `padding-block ${item.paddingBlock}, font-size ${item.fontSize}`,
    );
    if (item.scrollHeight > item.height + 1) failures.push(`command-palette/${size}/item text is vertically clipped`);
  }
}

function collectCompactInteractiveFailures(measurements, size, failures) {
  for (const [id, nodes] of Object.entries(measurements)) {
    if (nodes.length !== 1) {
      failures.push(`compact/${size}/${id} interactive locator count ${nodes.length}, expected 1`);
      continue;
    }
    const [node] = nodes;
    if (node.width < compactRemoveMinimum || node.height < compactRemoveMinimum) failures.push(
      `compact/${size}/${id} interactive rendered ${node.width}x${node.height}px, expected at least ${compactRemoveMinimum}px in both axes; min-block-size ${node.minBlockSize}`,
    );
  }
}

async function measurePortalOptions(page, target) {
  return page.evaluate(({ listSelector, optionSelector }) => {
    const list = document.querySelector(listSelector);
    const options = list ? [...list.querySelectorAll(optionSelector)] : [];
    return {
      count: options.length,
      list: list ? (() => {
        const rect = list.getBoundingClientRect();
        const style = getComputedStyle(list);
        return {
          display: style.display,
          height: rect.height,
          visibility: style.visibility,
          width: rect.width,
        };
      })() : null,
      options: options.map((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          fontSize: style.fontSize,
          height: rect.height,
          lineHeight: style.lineHeight,
          minBlockSize: style.minBlockSize,
          paddingBlock: style.paddingBlock,
          scrollHeight: node.scrollHeight,
          width: rect.width,
        };
      }),
    };
  }, target);
}

async function waitForPortalOptions(page, target, expectedHeight) {
  try {
    await page.waitForFunction(({ listSelector, optionSelector, targetHeight }) => {
      const list = document.querySelector(listSelector);
      const option = list?.querySelector(optionSelector);
      if (!list || !option) return false;
      const listStyle = getComputedStyle(list);
      const optionRect = option.getBoundingClientRect();
      return listStyle.display !== 'none'
        && listStyle.visibility !== 'hidden'
        && optionRect.height >= targetHeight - 0.01;
    }, { ...target, targetHeight: expectedHeight }, { timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForPortalClosed(page, listSelector) {
  try {
    await page.waitForFunction((selector) => {
      const list = document.querySelector(selector);
      if (!list) return true;
      const style = getComputedStyle(list);
      const rect = list.getBoundingClientRect();
      return style.display === 'none' || style.visibility === 'hidden' || rect.height === 0;
    }, listSelector, { timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

function collectPortalFailures(measurements, target, expectedHeight, label, failures) {
  if (measurements.count !== target.expectedCount) {
    failures.push(`${label} option locator count ${measurements.count}, expected ${target.expectedCount}; list ${JSON.stringify(measurements.list)}`);
    return;
  }
  if (!measurements.list || measurements.list.width <= 0 || measurements.list.height <= 0) {
    failures.push(`${label} list has zero geometry: ${JSON.stringify(measurements.list)}`);
  }
  for (const [index, option] of measurements.options.entries()) {
    if (!(option.height > 0 && option.width > 0)) failures.push(`${label} option ${index} has zero geometry`);
    if (Math.abs(option.height - expectedHeight) >= 0.01) failures.push(
      `${label} option ${index} rendered ${option.height}px, expected ${expectedHeight}px; `
      + `min-block-size ${option.minBlockSize}, padding-block ${option.paddingBlock}, font-size ${option.fontSize}`,
    );
    if (option.scrollHeight > option.height + 1) failures.push(`${label} option ${index} text is vertically clipped`);
  }
}

function collectAutocompleteFailures(measurements, expectedHeight, size, failures) {
  if (measurements.count !== 1) failures.push(
    `autocomplete-portal/${size} after focus locator count ${measurements.count}, expected 1; roots ${JSON.stringify(measurements.roots)}; lists ${JSON.stringify(measurements.lists)}`,
  );
  for (const node of measurements.nodes) {
    if (!(node.height > 0 && node.width > 0)) failures.push(`autocomplete-portal/${size} has zero geometry`);
    if (Math.abs(node.height - expectedHeight) >= 0.01) failures.push(
      `autocomplete-portal/${size} (.muxui-autocomplete-option) rendered ${node.height}px, expected ${expectedHeight}px; `
      + `min-block-size ${node.minBlockSize}, padding-block ${node.paddingBlock}, font-size ${node.fontSize}`,
    );
    if (node.scrollHeight > node.height + 1) failures.push(`autocomplete-portal/${size} text is vertically clipped`);
  }
}

async function waitForAutocompleteOptions(page, size, expectedHeight) {
  try {
    await page.waitForFunction(({ targetSize, targetHeight }) => {
      const list = document.querySelector(`.muxui-autocomplete-list[data-size="${targetSize}"]`);
      const option = list?.querySelector('.muxui-autocomplete-option');
      if (!list || !option) return false;
      const listStyle = getComputedStyle(list);
      const optionRect = option.getBoundingClientRect();
      return listStyle.display !== 'none'
        && listStyle.visibility !== 'hidden'
        && optionRect.height >= targetHeight - 0.01;
    }, { targetSize: size, targetHeight: expectedHeight }, { timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForAutocompleteClosed(page) {
  try {
    await page.waitForFunction(() => [...document.querySelectorAll('.muxui-autocomplete-list')].every((list) => {
      const style = getComputedStyle(list);
      const rect = list.getBoundingClientRect();
      return style.display === 'none' || style.visibility === 'hidden' || rect.height === 0;
    }), undefined, { timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForCommandPaletteClosed(page, size) {
  try {
    await page.waitForFunction((targetSize) => !document.querySelector(`[aria-label="Command search ${targetSize}"]`), size, { timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

function collectMeasurementFailures(measurements, expectedHeight, label, failures) {
  for (const [id, target] of Object.entries(measurements)) {
    const expectedCount = sizedTargets[id].count ?? 1;
    if (target.count !== expectedCount) failures.push(`${label}/${id} locator count ${target.count}, expected ${expectedCount}`);
    if (target.count === 0) continue;
    const [node] = target.nodes;
    if (!(node.height > 0 && node.width > 0)) failures.push(`${label}/${id} has zero geometry`);
    const targetHeight = sizedTargets[id].expectedHeight ?? expectedHeight;
    if (Math.abs(node.height - targetHeight) >= 0.01) failures.push(
      `${label}/${id} (${node.selector}) rendered ${node.height}px, expected ${targetHeight}px; `
      + `min-block-size ${node.minBlockSize}, padding-block ${node.paddingBlock}, font-size ${node.fontSize}`
      + (node.children ? `; anatomy ${JSON.stringify(node.children)}` : ''),
    );
  }
}

function collectDefaultMeasurementFailures(measurements, label, failures) {
  for (const [id, target] of Object.entries(measurements)) {
    const expectedCount = defaultTargets[id].count;
    if (target.count !== expectedCount) failures.push(`${label}/${id} locator count ${target.count}, expected ${expectedCount}`);
    for (const node of target.nodes) {
      if (!(node.height > 0 && node.width > 0)) failures.push(`${label}/${id} has zero geometry`);
      const expectedHeight = defaultTargets[id].expectedHeight ?? sizes.md;
      const minHeight = defaultTargets[id].minHeight;
      if (minHeight !== undefined ? node.height < minHeight : Math.abs(node.height - expectedHeight) >= 0.01) failures.push(
        `${label}/${id} (${node.selector}) rendered ${node.height}px, expected ${minHeight !== undefined ? `at least ${minHeight}px` : `${expectedHeight}px`}; `
        + `min-block-size ${node.minBlockSize}, padding-block ${node.paddingBlock}, font-size ${node.fontSize}`,
      );
    }
  }
}

test('hydrated controls keep 32/36/40 targets across scoped themes and densities', { timeout: 120_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('#control-sizing-fixture .muxui-button').first().waitFor();
    await waitForFixtureHydrated(page);
    await waitForTimeFieldsMounted(page);
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(errors, [], errors.join('\n'));
    assert.ok(await page.evaluate(() => Boolean(window.__muxuiControlSizingRoot)), 'fixture hydrated through hydrateRoot');
    assert.deepEqual(await page.evaluate(() => ({
      body: getComputedStyle(document.body).fontSize,
      field: getComputedStyle(document.querySelector('.muxui-field-input')).fontSize,
    })), { body: '16px', field: '16px' }, 'baseline examples use the 16px root text scale');

    const targetTokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        lg: style.getPropertyValue('--muxui-control-size-lg').trim(),
        md: style.getPropertyValue('--muxui-control-size-md').trim(),
        sm: style.getPropertyValue('--muxui-control-size-sm').trim(),
        xl: style.getPropertyValue('--muxui-control-size-xl').trim(),
      };
    });
    assert.equal(targetTokens.sm, '2rem');
    assert.equal(targetTokens.md, '2.25rem');
    assert.equal(targetTokens.lg, '2.5rem');
    assert.equal(targetTokens.xl, '', 'there is no 44px size tier');

    const themeBackgrounds = {};
    const geometryFailures = [];
    const behaviorFailures = [];
    await page.locator('.control-sizing-alert-dialog-close-text').waitFor();
    const alertCloseCases = await measureAlertDialogCloseCases(page);
    const alertTextClose = alertCloseCases.text;
    const alertIconClose = alertCloseCases.icon;
    if (!alertTextClose || !alertIconClose) {
      behaviorFailures.push(`alert-dialog close fixture missing cases: ${JSON.stringify(alertCloseCases)}`);
    } else {
      if (Math.abs(alertIconClose.width - sizes.sm) >= 0.01 || Math.abs(alertIconClose.height - sizes.sm) >= 0.01) {
        behaviorFailures.push(`alert-dialog default icon close rendered ${alertIconClose.width}x${alertIconClose.height}px, expected ${sizes.sm}px square`);
      }
      if (!(alertTextClose.width > alertIconClose.width)) {
        behaviorFailures.push(`alert-dialog text close rendered ${alertTextClose.width}px, expected wider than icon close ${alertIconClose.width}px`);
      }
      if (Math.abs(alertTextClose.height - sizes.sm) >= 0.01) {
        behaviorFailures.push(`alert-dialog text close rendered ${alertTextClose.height}px high, expected ${sizes.sm}px`);
      }
      if (alertTextClose.className.includes('muxui-icon-button')) {
        behaviorFailures.push('alert-dialog text close retains the icon-button class');
      }
      if (!alertIconClose.className.includes('muxui-icon-button')) {
        behaviorFailures.push('alert-dialog default icon close is missing the icon-button class');
      }
      if (alertTextClose.scrollHeight > alertTextClose.clientHeight + 1) {
        behaviorFailures.push(`alert-dialog text close clips its label: scrollHeight ${alertTextClose.scrollHeight}px, client height ${alertTextClose.clientHeight}px`);
      }
      if (alertTextClose.scrollWidth > alertTextClose.clientWidth + 1) {
        behaviorFailures.push(`alert-dialog text close clips its label horizontally: scrollWidth ${alertTextClose.scrollWidth}px, client width ${alertTextClose.clientWidth}px`);
      }
    }
    for (const scheme of ['light', 'dark']) {
      await page.evaluate((value) => document.documentElement.setAttribute('data-muxui-color-scheme', value), scheme);
      themeBackgrounds[scheme] = await page.evaluate(() => ({
        body: getComputedStyle(document.body).backgroundColor,
        field: getComputedStyle(document.querySelector('.muxui-field-input')).backgroundColor,
        color: getComputedStyle(document.querySelector('.muxui-field-input')).color,
      }));
      for (const density of ['comfortable', 'compact']) {
        await page.evaluate((value) => document.documentElement.setAttribute('data-muxui-density', value), density);
        for (const size of sizeRows) {
          const measurements = await measureTargets(page, `[data-size-row="${size}"]`, sizedTargets);
          collectMeasurementFailures(measurements, sizes[size], `${scheme}/${density}/${size}`, geometryFailures);
        }
        const defaults = await measureTargets(page, '[data-default-controls]', defaultTargets);
        collectDefaultMeasurementFailures(defaults, `${scheme}/${density}/defaults`, geometryFailures);
        collectTableCellFailures(
          await measureTableCells(page),
          `${scheme}/${density}/defaults`,
          geometryFailures,
        );
        if (density === 'compact') {
          for (const size of sizeRows) {
            collectCompactInteractiveFailures(
              await measureCompactInteractiveTargets(page, size),
              size,
              geometryFailures,
            );
          }
        }
      }
      await page.evaluate(() => document.documentElement.setAttribute('data-muxui-density', 'comfortable'));
      await page.screenshot({ path: `/tmp/muxui-control-sizing-${scheme}.png`, fullPage: true });
    }
    // Use a fresh hydrated page for every focus-only popup check. Autocomplete
    // roots share portal state and focus restoration, so reusing the geometry
    // page can make a later size look closed for reasons unrelated to sizing.
    for (const size of [...sizeRows].reverse()) {
      const popupPage = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
      popupPage.on('pageerror', (error) => errors.push(`autocomplete/${size}: ${error.message}`));
      popupPage.on('console', (message) => { if (message.type() === 'error') errors.push(`autocomplete/${size}: ${message.text()}`); });
      try {
        await popupPage.goto(url, { waitUntil: 'networkidle' });
        await popupPage.locator('#control-sizing-fixture .muxui-button').first().waitFor();
        await waitForFixtureHydrated(popupPage);
        await waitForTimeFieldsMounted(popupPage);
        await popupPage.evaluate(() => document.fonts.ready);
        const autocompleteInput = popupPage.locator(`[data-size-row="${size}"] [data-control-id="autocomplete"] .muxui-field-input`);
        await focusAfterScroll(popupPage, autocompleteInput);
        await waitForAutocompleteOptions(popupPage, size, sizes[size]);
        collectAutocompleteFailures(await measureAutocompleteOptions(popupPage, size), sizes[size], size, geometryFailures);
        await popupPage.keyboard.press('Escape');
        if (!(await waitForAutocompleteClosed(popupPage))) {
          behaviorFailures.push(`autocomplete-portal/${size} remained visible after Escape`);
        }
      } finally {
        await popupPage.close();
      }
    }
    for (const size of [...sizeRows].reverse()) {
      const popupPage = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
      popupPage.on('pageerror', (error) => errors.push(`command-palette/${size}: ${error.message}`));
      popupPage.on('console', (message) => { if (message.type() === 'error') errors.push(`command-palette/${size}: ${message.text()}`); });
      try {
        await popupPage.goto(url, { waitUntil: 'networkidle' });
        await popupPage.locator('#control-sizing-fixture .muxui-button').first().waitFor();
        await waitForFixtureHydrated(popupPage);
        await waitForTimeFieldsMounted(popupPage);
        await popupPage.evaluate(() => {
          document.documentElement.setAttribute('data-muxui-density', 'compact');
          return document.fonts.ready;
        });
        const trigger = popupPage.locator(`[data-size-row="${size}"] [data-control-id="command-palette"] .muxui-command-palette__trigger`);
        await clickAfterScroll(popupPage, trigger);
        await popupPage.locator(`[aria-label="Command search ${size}"]`).waitFor({ state: 'visible' });
        collectCommandPaletteFailures(
          await measureCommandPaletteInput(popupPage, size),
          sizes[size],
          size,
          geometryFailures,
        );
        await popupPage.keyboard.press('Escape');
        if (!(await waitForCommandPaletteClosed(popupPage, size))) {
          behaviorFailures.push(`command-palette/${size} remained visible after Escape`);
        }
      } finally {
        await popupPage.close();
      }
    }
    for (const [controlId, target] of Object.entries(portalTargets)) {
      for (const size of [...sizeRows].reverse()) {
        const popupPage = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
        popupPage.on('pageerror', (error) => errors.push(`${controlId}/${size}: ${error.message}`));
        popupPage.on('console', (message) => { if (message.type() === 'error') errors.push(`${controlId}/${size}: ${message.text()}`); });
        try {
          await popupPage.goto(url, { waitUntil: 'networkidle' });
          await popupPage.locator('#control-sizing-fixture .muxui-button').first().waitFor();
          await waitForFixtureHydrated(popupPage);
          await waitForTimeFieldsMounted(popupPage);
          await popupPage.evaluate(() => document.fonts.ready);
          const controlCase = popupPage.locator(`[data-size-row="${size}"] [data-control-id="${controlId}"]`);
          const opener = controlCase.locator(target.opener);
          if (target.focusOnly) await focusAfterScroll(popupPage, opener);
          else await clickAfterScroll(popupPage, opener);
          await waitForPortalOptions(popupPage, target, sizes[size]);
          collectPortalFailures(
            await measurePortalOptions(popupPage, target),
            target,
            sizes[size],
            `portal/${controlId}/${size}`,
            geometryFailures,
          );
          await popupPage.keyboard.press('Escape');
          if (!(await waitForPortalClosed(popupPage, target.listSelector))) {
            behaviorFailures.push(`portal/${controlId}/${size} remained visible after Escape`);
          }
        } finally {
          await popupPage.close();
        }
      }
    }
    if (JSON.stringify(themeBackgrounds.light) === JSON.stringify(themeBackgrounds.dark)) {
      behaviorFailures.push('theme scope does not change field colors');
    }

    const readControlHeights = () => page.evaluate(() => Object.fromEntries(['sm', 'md', 'lg'].map((size) => [size, {
      button: document.querySelector(`[data-size-row="${size}"] [data-control-id="button"] .muxui-button`)?.getBoundingClientRect().height,
      field: document.querySelector(`[data-size-row="${size}"] [data-control-id="text-field"] .muxui-field-input`)?.getBoundingClientRect().height,
    }])));
    const baselineHeights = await readControlHeights();
    for (const [property, value] of [
      ['--muxui-semantic-control-size-md', '48px'],
      ['--muxui-semantic-control-min-height', '52px'],
    ]) {
      await page.evaluate(([name, nextValue]) => document.documentElement.style.setProperty(name, nextValue), [property, value]);
      const overriddenHeights = await readControlHeights();
      for (const part of ['button', 'field']) {
        if (Math.abs(overriddenHeights.md[part] - Number.parseFloat(value)) >= 0.01) behaviorFailures.push(
          `${property} does not resize default ${part}: rendered ${overriddenHeights.md[part]}px, expected ${value}`,
        );
        for (const size of ['sm', 'lg']) {
          if (Math.abs(overriddenHeights[size][part] - baselineHeights[size][part]) >= 0.01) behaviorFailures.push(
            `${property} unexpectedly resizes ${size} ${part}: before ${baselineHeights[size][part]}px, after ${overriddenHeights[size][part]}px`,
          );
        }
      }
      await page.evaluate((name) => document.documentElement.style.removeProperty(name), property);
    }

    const nativeInput = page.locator('[data-size-row="md"] [data-control-id="input-native-size"] .muxui-input');
    const nativeSize = await nativeInput.getAttribute('size');
    if (nativeSize !== '8') behaviorFailures.push(`numeric native input size is ${nativeSize}, expected HTML size attribute 8`);

    const invalidInput = page.locator('[data-size-row="md"] [data-control-id="text-field-invalid"] .muxui-field-input');
    const normalInput = page.locator('[data-size-row="md"] [data-control-id="text-field"] .muxui-field-input');
    const beforeState = await Promise.all([normalInput, invalidInput].map(async (locator) => locator.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    })));
    const invalidAria = await invalidInput.getAttribute('aria-invalid');
    if (invalidAria !== 'true') behaviorFailures.push(`invalid field aria-invalid is ${invalidAria}, expected true`);
    await invalidInput.focus();
    const afterState = await invalidInput.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    });
    if (JSON.stringify(afterState) !== JSON.stringify(beforeState[1])) {
      behaviorFailures.push(`focus changes invalid field geometry: before ${JSON.stringify(beforeState[1])}, after ${JSON.stringify(afterState)}`);
    }
    if (JSON.stringify(beforeState[0]) !== JSON.stringify(beforeState[1])) {
      behaviorFailures.push(`invalid field geometry differs from normal sibling: normal ${JSON.stringify(beforeState[0])}, invalid ${JSON.stringify(beforeState[1])}`);
    }

    const mdButton = page.locator('[data-size-row="md"] [data-control-id="button"] .muxui-button');
    const widthBeforeSpacing = await mdButton.evaluate((node) => node.getBoundingClientRect().width);
    await page.evaluate(() => document.documentElement.setAttribute('data-test-spacing', 'wide'));
    const spacingState = await mdButton.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        clientHeight: node.clientHeight,
        height: rect.height,
        paddingInline: style.paddingInline,
        scrollHeight: node.scrollHeight,
        width: rect.width,
        componentButtonPaddingInline: style.getPropertyValue('--muxui-component-button-padding-inline').trim(),
      };
    });
    if (!(spacingState.width > widthBeforeSpacing)) {
      behaviorFailures.push(
        `spacing override does not change button width: before ${widthBeforeSpacing}px, after ${spacingState.width}px; `
        + `padding-inline ${spacingState.paddingInline}, component button token ${spacingState.componentButtonPaddingInline}`,
      );
    }
    if (spacingState.height !== sizes.md) {
      behaviorFailures.push(`spacing override changes button height to ${spacingState.height}px, expected ${sizes.md}px`);
    }
    if (!(spacingState.scrollHeight <= spacingState.clientHeight + 1)) {
      behaviorFailures.push(`spacing override clips button text: scrollHeight ${spacingState.scrollHeight}px, clientHeight ${spacingState.clientHeight}px`);
    }
    await page.evaluate(() => document.documentElement.removeAttribute('data-test-spacing'));

    await page.evaluate(() => document.documentElement.setAttribute('data-text-scale', '200'));
    const scaledState = await page.evaluate(() => {
      const nodes = [
        document.querySelector('[data-size-row="md"] [data-control-id="button"] .muxui-button'),
        document.querySelector('[data-size-row="md"] [data-control-id="text-field"] .muxui-field-input'),
      ];
      return nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { clientHeight: node.clientHeight, height: rect.height, scrollHeight: node.scrollHeight };
      });
    });
    for (const [index, state] of scaledState.entries()) {
      if (!(state.height > sizes.md)) {
        behaviorFailures.push(`200% text case ${index} stays at ${state.height}px, expected growth beyond ${sizes.md}px`);
      }
      if (!(state.scrollHeight <= state.clientHeight + 1)) {
        behaviorFailures.push(`200% text case ${index} clips: scrollHeight ${state.scrollHeight}px, clientHeight ${state.clientHeight}px`);
      }
    }
    await page.evaluate(() => document.documentElement.removeAttribute('data-text-scale'));

    await page.emulateMedia({ forcedColors: 'active' });
    const buttonFocusTarget = page.locator('[data-size-row="md"] [data-control-id="button"] .muxui-button');
    await buttonFocusTarget.evaluate((button) => {
      const origin = document.createElement('span');
      origin.id = 'control-sizing-focus-origin';
      origin.tabIndex = 0;
      origin.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;';
      button.before(origin);
      origin.focus();
    });
    await page.keyboard.press('Tab');
    const forcedColorsFocus = await buttonFocusTarget.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        active: document.activeElement === node,
        boxShadow: style.boxShadow,
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        tagName: node.tagName,
      };
    });
    if (!forcedColorsFocus.active) behaviorFailures.push('forced-colors keyboard focus did not reach the intended button');
    if (!(
      forcedColorsFocus?.boxShadow !== 'none'
      || (forcedColorsFocus?.outlineStyle !== 'none'
        && forcedColorsFocus?.outlineWidth !== '0px'
        && forcedColorsFocus?.outlineColor !== 'transparent')
    )) {
      behaviorFailures.push(`forced-colors button focus is not visible: ${JSON.stringify(forcedColorsFocus)}`);
    }
    await page.locator('#control-sizing-focus-origin').evaluate((origin) => origin.remove());
    await invalidInput.focus();
    const forcedInvalid = await invalidInput.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        borderColor: style.borderTopColor,
        borderStyle: style.borderTopStyle,
        borderWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    if (!(
      forcedInvalid.boxShadow !== 'none'
      || (forcedInvalid.borderStyle !== 'none'
        && forcedInvalid.borderWidth !== '0px'
        && forcedInvalid.borderColor !== 'transparent')
      || (forcedInvalid.outlineStyle !== 'none'
        && forcedInvalid.outlineWidth !== '0px'
        && forcedInvalid.outlineColor !== 'transparent')
    )) {
      behaviorFailures.push(`forced-colors invalid field is not visible: ${JSON.stringify(forcedInvalid)}`);
    }
    if (errors.length) behaviorFailures.push(`page errors:\n${errors.join('\n')}`);
    const failures = [...geometryFailures, ...behaviorFailures];
    assert.deepEqual(failures, [], failures.join('\n'));
    await page.emulateMedia({ forcedColors: 'none' });
  } finally {
    await browser?.close();
    await server.close();
  }
});
