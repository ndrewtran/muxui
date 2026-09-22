import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSpringCSS } from '../src/motion-spring-css.mjs';

test('compiles a critically damped spring to Motion-compatible CSS points', () => {
  assert.deepEqual(compileSpringCSS({ visualDuration: 0.15 }), {
    duration: 350,
    easing: 'linear(0, 0.3049, 0.6506, 0.8453, 0.936, 0.9746, 0.9902, 0.9963, 0.9986, 0.9995, 1, 1)',
  });
  assert.deepEqual(compileSpringCSS({ visualDuration: 0.2, bounce: 0 }), {
    duration: 400,
    easing: 'linear(0, 0.2175, 0.5207, 0.7361, 0.8631, 0.9317, 0.9668, 0.9842, 0.9926, 0.9966, 0.9984, 0.9993, 1)',
  });
});

test('preserves a bounded underdamped overshoot', () => {
  assert.deepEqual(compileSpringCSS({ visualDuration: 0.2, bounce: 0.2 }), {
    duration: 400,
    easing: 'linear(0, 0.2375, 0.5904, 0.8358, 0.9599, 1.0061, 1.0152, 1.0116, 1.0062, 1.0025, 1.0006, 0.9999, 1)',
  });
});

test('supports the finite zero and maximum duration bounds', () => {
  assert.deepEqual(compileSpringCSS({ visualDuration: 0 }), { duration: 0, easing: 'linear' });
  assert.equal(compileSpringCSS({ visualDuration: 10 }).duration, 14_200);
});

test('rejects invalid bounds and springs that do not settle in twenty seconds', () => {
  for (const visualDuration of [Number.NaN, Number.POSITIVE_INFINITY, -1, 10.001]) {
    assert.throws(() => compileSpringCSS({ visualDuration }), /MUXUI_MOTION_SPRING/u);
  }
  for (const bounce of [Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01]) {
    assert.throws(() => compileSpringCSS({ visualDuration: 0.2, bounce }), /MUXUI_MOTION_SPRING/u);
  }
  assert.throws(
    () => compileSpringCSS({ visualDuration: 10, bounce: 1 }),
    /MUXUI_MOTION_SPRING_UNSETTLED/u,
  );
});
