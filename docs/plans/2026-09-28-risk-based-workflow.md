# Risk-based workflow implementation plan

Scope: audit findings 4–8, requested by the user. Finding 9 is explicitly excluded.
Existing records retain strict
semantics; no production authority or human gate is removed.

## Deliverables

- [x] Policy snapshot: new bounded/low-risk work can use the parent Jira issue,
  one independent combined review, and change-appropriate verification. Bind the
  snapshot into the approved manifest. Legacy records remain strict.
- [x] Canonical tickets: generate optional detailed Markdown and hashes from
  structured ticket definitions; do not manually synchronize AC copies.
- [x] Selective revalidation: invalidate changed slices and transitive dependents
  only with hashed impact evidence. Always rerun final integrated verification.
- [x] Scoped instructions: shared principles for technical skills; phase owners
  alone load state contracts. Consolidate the current design and operations docs.

## Implementation and validation

1. Extend state tests with explicit light-policy fixtures, parent-only routing,
   independent same-family/human review, non-behavior verification, policy tamper
   rejection and impact-scoped invalidation; first observe failures.
2. Add shared workflow definitions and deterministic ticket preparation. Test
   configuration resolution, generated artifact consistency and invalid input.
3. Update phase/role instructions and the single current design contract together.
   Preserve the already-fixed next/guard/visual-mode behavior.
4. Run targeted tests, the complete local suite, package validation and diff checks.
   Model comparison/evaluation tooling is outside this change.

No branch, commit, publication, installation or infrastructure change is included.
