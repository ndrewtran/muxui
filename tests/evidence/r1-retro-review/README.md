# R1.2 to R1.4 retained retroactive review evidence

Decision 0022 amendment 01 corrects Decision 0022's premise: pull requests
#102 and #105 through #108 have no hosted reviews. This root retains the
retroactive independent reviews of the current code for the R1.2, R1.3, and
R1.4 families, run by read-only Claude Opus 5.5 (`claude-opus-5-5`) reviewer
agents in Claude Code on one reviewed commit in four lanes: R1.2 fields, R1.3
collections, R1.3 pickers, and R1.4 overlays. R1.1 and R1.5 have no review
here; the amendment records their review as author-reported only.

`artifacts/` holds each reviewer report, sanitized; `verification.json` binds
each artifact to the digest of the unsanitized report and lists the
sanitization rules; `records/` holds one record per lane with the reviewed
commit and tree, reviewer independence, lenses, per-family verdicts, findings
with severity, and each finding's `resolution`.

A lane or family verdict of `findings` is not a pass. `clear` means the
reviewer found nothing within the stated lenses, files, tests, and probes. A
family's verdict is derived from the findings that name it; `reportTableVerdict`
keeps the report table's wording where it differs. Manual and
assistive-technology testing stays unmet and deferred to `S1.0`. This root
makes no support, publication, or release claim.

Each finding starts `pending`. Record merged fixes with
`node tests/evidence/capture-r1-retro-review.mjs --resolve=<lane>/<id>[,...]=<commit>`,
or an unfixed finding with `--accept=<lane>/<id>=<reason>`; the tool rewrites
only the records and this index, and fails if a retained artifact changed.
Report bytes are never edited.
