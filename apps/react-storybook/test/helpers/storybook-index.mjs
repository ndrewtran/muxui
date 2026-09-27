export async function fetchStorybookIndex(url, { signal, timeoutMs = 10_000 } = {}) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
  const response = await fetch(url, { signal: requestSignal });
  if (!response.ok) throw new Error(`Storybook index request failed with HTTP ${response.status}`);
  return response.json();
}
