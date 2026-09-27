// Page audits record each failing page/scheme and keep going so one run reports
// every failure. Cancellation still stops immediately because later pages
// would only repeat the abort.
export function recordPageFailure(failures, { scheme, id, family, check }, error, { signal, log = console.error } = {}) {
  if (signal?.aborted) throw error;
  const failure = { scheme, id, family, check, message: error?.message ?? String(error) };
  failures.push(failure);
  // Printed immediately so a later timeout still leaves the evidence in the log.
  log(`[storybook-audit] failed ${failureHeading(failure)}`);
}

function failureHeading({ scheme, id, family, check }) {
  return [scheme, id, family && `(${family})`, check && `[${check}]`].filter(Boolean).join(' ');
}

export function pageFailureReport(title, failures) {
  const sorted = [...failures].sort((left, right) => `${left.id}\0${left.scheme}\0${left.check ?? ''}`
    .localeCompare(`${right.id}\0${right.scheme}\0${right.check ?? ''}`));
  const pages = new Set(sorted.map(({ id }) => id));
  return [
    `${title}: ${sorted.length} failure(s) across ${pages.size} page(s)`,
    ...sorted.map((failure) => `- ${failureHeading(failure)}\n${failure.message.replace(/^/gmu, '    ')}`),
  ].join('\n');
}

export function assertNoPageFailures(title, failures) {
  if (failures.length > 0) throw new Error(pageFailureReport(title, failures));
}
