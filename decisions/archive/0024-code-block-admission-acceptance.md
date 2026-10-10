# Decision 0024 accepted direction

On 5 October 2026, Andrew requested independent Mux UI implementations based
on Beautiful UI offerings, approved the delivery sequence with CodeBlock first,
and chose:

> For all Beautiful UI candidates, use the Beautiful UI as the basis for the design in Mux UI.

The selected rendered design is the compact filename/Copy header, line-numbered
listing, and unified diff at Beautiful UI's Code Block demonstration. This
record admits only the bounded CodeBlock addition in Decision 0024. Other
candidates still require their own named admission before implementation.

The instruction authorizes local scope and implementation work. It does not
accept evidence, complete a milestone, request a pull request, authorize a
merge, publish, or permit production or consumer mutation.

## 7 October 2026: Shiki highlighting extension

Andrew explicitly requested integrating Shiki into Mux UI CodeBlock for syntax
highlighting. This accepts the narrow extension in Decision 0024 and its aligned
Architecture, Roadmap, and Product Scope 18.0.0 amendment: one exact private
Shiki dependency, lazy client highlighting through the existing language prop,
escaped original text, bounded work, and safe plain-text fallback. The existing
CodeBlock container and Mux semantic color reference remain the selected design.

The separate question about TextEditor language support is feasibility only;
it authorizes no TextEditor change. This direction requests local implementation
and verification, with no pull request, tracker write, merge, publication,
production, daily-driver preview, or consumer mutation.
