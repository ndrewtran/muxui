import assert from 'node:assert/strict';
import test from 'node:test';
import source from '../../../catalog/tokens/default-theme.json' with { type: 'json' };
import fixture from './fixtures/scale-reference.json' with { type: 'json' };
import { generateScaleTheme, randomScaleBaseColor } from '../src/authoring.mjs';

test('Mux palettes equal complete values captured independently from the pinned donor', () => {
  assert.equal(fixture.donor.commit, '94bf62a26c02605c8928dfeb24f0ddc4be1c92fd');
  assert.equal(fixture.cases.length, 74);
  for (const { id, inputs, expected } of fixture.cases) {
    const result = generateScaleTheme({ source, ...inputs, contrastPivot: 'auto', curvature: 1 });
    assert.deepEqual(result.palettes, expected, id);
  }
});

test('canonical preset names and anchors equal the captured donor definitions', () => {
  assert.deepEqual(source.theme.scale.standardPresets.map((preset) => ({
    id: preset.id, name: preset.name, description: preset.description,
    brandColor: source.tokens[preset.namedColor].value,
    neutralColor: source.tokens[preset.neutralColor].value,
  })), fixture.presets.standard);
  assert.deepEqual(source.theme.scale.monochromePresets.map((preset) => ({
    id: preset.id, name: preset.name, description: preset.description,
    color: source.tokens[preset.color].value,
  })), fixture.presets.mono);
});

test('bounded random sampling matches donor outcomes and sample consumption', () => {
  for (const { mode, whiteAnchor, seed, expected, calls: expectedCalls } of fixture.randomCases) {
    let state = seed >>> 0;
    let calls = 0;
    const random = () => {
      calls += 1;
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    assert.equal(randomScaleBaseColor(mode, { whiteAnchor, random }), expected, `${mode}:${seed}`);
    assert.equal(calls, expectedCalls, `${mode}:${seed}:samples`);
  }
  assert.throws(() => randomScaleBaseColor('invalid'), /MUXUI_SCALE_RANDOM_MODE_INVALID/);
  assert.throws(() => randomScaleBaseColor('named', { random: () => Number.NaN }), /MUXUI_SCALE_RANDOM_VALUE_INVALID/);
});
