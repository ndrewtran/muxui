export class GenerationProofError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'GenerationProofError';
    this.code = code;
  }
}

function sameEntries(left, right) {
  if (left.size !== right.size) return false;
  for (const [path, digest] of left) {
    if (right.get(path) !== digest) return false;
  }
  return true;
}

function selectEntries(snapshot, projectionPaths, includeProjections) {
  const selected = new Map();
  for (const [path, digest] of snapshot) {
    const isProjection = projectionPaths.has(path);
    if (isProjection === includeProjections) selected.set(path, digest);
  }
  return selected;
}

export function verifyGenerationState({
  firstBeforeFiles,
  firstFiles,
  secondBeforeFiles,
  secondFiles,
  projectionPaths = [],
  firstStatus,
  secondStatus,
}) {
  if (firstStatus.trim()) {
    throw new GenerationProofError(
      'GENERATION_WORKTREE_DIRTY',
      `first generation run left worktree changes: ${firstStatus.trim()}`,
    );
  }
  if (secondStatus.trim()) {
    throw new GenerationProofError(
      'GENERATION_WORKTREE_DIRTY',
      `second generation run left worktree changes: ${secondStatus.trim()}`,
    );
  }

  const projections = new Set(projectionPaths);
  const firstBeforeSources = selectEntries(firstBeforeFiles, projections, false);
  const secondBeforeSources = selectEntries(secondBeforeFiles, projections, false);
  const firstSources = selectEntries(firstFiles, projections, false);
  const secondSources = selectEntries(secondFiles, projections, false);
  const firstProjections = selectEntries(firstFiles, projections, true);
  const secondProjections = selectEntries(secondFiles, projections, true);

  if (!sameEntries(firstBeforeSources, secondBeforeSources)) {
    throw new GenerationProofError(
      'GENERATION_BASELINE_DRIFT',
      'independent clean checkouts did not start from identical source content',
    );
  }
  if (!sameEntries(firstBeforeSources, firstSources)
    || !sameEntries(secondBeforeSources, secondSources)) {
    throw new GenerationProofError(
      'GENERATION_DRIFT',
      'generation changed clean-checkout source content; repair the earliest source',
    );
  }
  if (!sameEntries(firstProjections, secondProjections)) {
    throw new GenerationProofError(
      'GENERATION_NONDETERMINISTIC',
      'independent clean generation runs produced different projection output',
    );
  }
}
