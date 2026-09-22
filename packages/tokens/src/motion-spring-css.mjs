/*!
 * The spring equations and threshold choices are adapted from Motion 13.4.0's
 * motion-dom spring generator (motion-dom 13.3.0),
 * https://github.com/motiondivision/motion/blob/main/packages/motion-dom/src/animation/generators/spring.ts.
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2024 [Motion](https://motion.dev) B.V.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const MAX_VISUAL_DURATION_SECONDS = 10;
const MAX_SETTLE_DURATION_MS = 20_000;
const SETTLE_STEP_MS = 50;
const REST_SPEED = 0.01;
const REST_DELTA = 0.005;
const MIN_DAMPING_RATIO = 0.05;

function assertFinite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`MUXUI_MOTION_SPRING_${name}_INVALID`);
}

function springState(visualDuration, bounce) {
  const dampingRatio = Math.max(MIN_DAMPING_RATIO, Math.min(1, 1 - bounce));
  const root = (2 * Math.PI) / (visualDuration * 1.2);
  const undampedAngularFrequency = root / 1000;
  const decay = dampingRatio * undampedAngularFrequency;

  if (dampingRatio === 1) {
    const position = (time) => 1 - Math.exp(-undampedAngularFrequency * time)
      * (1 + undampedAngularFrequency * time);
    const velocity = (time) => Math.exp(-undampedAngularFrequency * time)
      * undampedAngularFrequency * undampedAngularFrequency * time * 1000;
    return { position, velocity };
  }

  const angularFrequency = undampedAngularFrequency * Math.sqrt(1 - dampingRatio * dampingRatio);
  const amplitude = dampingRatio / Math.sqrt(1 - dampingRatio * dampingRatio);
  const sineCoefficient = decay * amplitude + angularFrequency;
  const cosineCoefficient = decay - amplitude * angularFrequency;

  const position = (time) => {
    const envelope = Math.exp(-decay * time);
    return 1 - envelope * (
      amplitude * Math.sin(angularFrequency * time) + Math.cos(angularFrequency * time)
    );
  };
  const velocity = (time) => Math.exp(-decay * time) * (
    sineCoefficient * Math.sin(angularFrequency * time)
      + cosineCoefficient * Math.cos(angularFrequency * time)
  ) * 1000;
  return { position, velocity };
}

/**
 * Compile Motion's duration-based spring into a CSS `linear()` easing.
 *
 * The time scan follows Motion's 50 ms rest check; each sampled value is
 * evaluated from the closed-form critically or underdamped equation.
 */
export function compileSpringCSS({ visualDuration, bounce = 0 } = {}) {
  assertFinite(visualDuration, 'DURATION');
  assertFinite(bounce, 'BOUNCE');
  if (visualDuration < 0 || visualDuration > MAX_VISUAL_DURATION_SECONDS) {
    throw new RangeError('MUXUI_MOTION_SPRING_DURATION_OUT_OF_RANGE');
  }
  if (bounce < 0 || bounce > 1) throw new RangeError('MUXUI_MOTION_SPRING_BOUNCE_OUT_OF_RANGE');
  if (visualDuration === 0) return { duration: 0, easing: 'linear' };

  const { position, velocity } = springState(visualDuration, bounce);
  const settled = (time) => Math.abs(velocity(time)) <= REST_SPEED
    && Math.abs(1 - position(time)) <= REST_DELTA;
  let duration = 0;
  while (!settled(duration) && duration < MAX_SETTLE_DURATION_MS) duration += SETTLE_STEP_MS;
  if (duration >= MAX_SETTLE_DURATION_MS) throw new RangeError('MUXUI_MOTION_SPRING_UNSETTLED');

  const pointCount = Math.max(Math.round(duration / 30), 2);
  const points = Array.from({ length: pointCount }, (_, index) => {
    const time = duration * index / (pointCount - 1);
    return settled(time) ? 1 : position(time);
  }).map((value) => String(Math.round(value * 10000) / 10000));
  return { duration, easing: `linear(${points.join(', ')})` };
}
