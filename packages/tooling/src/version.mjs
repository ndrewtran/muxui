import toolingPackage from '../package.json' with { type: 'json' };

// Read from the installed package at runtime: release preparation rewrites the version in the packed manifest, so a
// value compiled into source or generated before packing would drift from the tarball.
export const TOOLING_VERSION = toolingPackage.version;
