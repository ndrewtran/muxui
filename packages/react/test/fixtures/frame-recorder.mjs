/**
 * Records `sample(arg, state)` inside the page on every animation frame until
 * `stop()` resolves with the recorded frames. Start it before the action that
 * begins the motion, then assert on the frames, so mid-flight claims do not
 * depend on when a Node round trip happens to land.
 *
 * `sample` is serialized into the page: it cannot close over Node values, so
 * pass them through `arg`. `state` is one mutable object per recording, for
 * samplers that must act in the same frame they read (e.g. interrupting an
 * exit at the recorded value). Frames that return null or undefined are skipped.
 */
export async function recordFrames(page, sample, arg) {
  const recording = await page.evaluateHandle(({ source, input }) => {
    const read = new Function(`return (${source});`)();
    const current = { frames: [], state: {}, stopped: false };
    const tick = () => {
      if (current.stopped) return;
      const value = read(input, current.state);
      if (value !== null && value !== undefined) current.frames.push(value);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return current;
  }, { source: sample.toString(), input: arg });
  return {
    /** Waits in-page until `predicate({ frames, state })` is truthy. */
    async waitFor(predicate, options) {
      await page.waitForFunction(predicate, recording, options);
    },
    async stop() {
      const frames = await recording.evaluate((current) => {
        current.stopped = true;
        return current.frames;
      });
      await recording.dispose();
      return frames;
    },
  };
}
