# AI Engine Briefing

This is a separate reporting project. The engine source is read-only input configured in `.local/config.json`. Never implement or modify the engine here, and never count reporting work as engine progress.

- Keep raw source documents, source paths, commit messages, local inventory and credentials out of Git and `docs/`.
- Public progress lives in `content/progress.json`; record only evidence-backed status through `scripts/progress.mjs`.
- The collector does not run engine tests. File counts are observations, not completion evidence.
- Run `npm test` and `npm run check` after changing the collector, publisher or page behavior.
- Do not introduce external dependencies for static reporting.
- Automatic publishing stages only the two public data files. Commit application edits explicitly after review.
