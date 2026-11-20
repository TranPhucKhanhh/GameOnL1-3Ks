# Coding Standards

Judgement-call conventions enforced during `/code-review` (mechanical checks live in `scripts/lint.mjs` via `npm run lint`).

## Web UI (`web/src/`)

- **Idempotent background rendering:** Keep `render()` and `renderOverlay()` idempotent across polling intervals (`3s` refresh, `1s` countdowns). Update countdown text nodes in place and skip full `#ui.innerHTML` rebuilds when panel, tab, and island state are unchanged so interactive DOM nodes stay attached.
- **Single copy helper:** Share dynamic UI strings (such as timer/expiry text) through one helper rather than duplicating template literals across initial render and interval updates.

## Browser Tests (`test/browser/`)

- **Shared lifecycle:** Use `withCaptains` in `test/browser/helpers.mjs` for captain launch, registration, `pageerror` assertions, and context teardown.
- **State-based waits:** Wait on observable UI or chain state (`toBeVisible`, `toBeEnabled`, `toContainText`, `toBeHidden`) rather than fixed timeouts.
- **Atomic layout reads:** Measure `#ui`/`#sheet` geometry in one `page.evaluate(...)` (with `expect.poll` after state changes) rather than `.boundingBox()`, so background `render()` refreshes cannot detach elements mid-read.
- **Clear handle names:** Name page and captain handles descriptively (`captainHandle`, `desktopPage`) instead of single-letter abbreviations.
