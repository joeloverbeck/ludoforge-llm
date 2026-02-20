# Runner UI Shell Layout Contract

Top-level runner screens must follow one canonical shell sizing strategy:

1. `html`, `body`, and `#root` define the root-chain sizing in `tokens.css`.
2. Screen-root CSS modules use root-chain-compatible sizing (`min-height: 100%`; plus `width: 100%` where needed for absolute child layering).
3. Top-level screen modules must not use `100vw` or `100vh` for shell boundaries.

This contract applies to screen roots such as `GameContainer`, `ReplayScreen`, `GameSelectionScreen`, and `PreGameConfigScreen`. Component-level responsive sizing inside dialogs/panels can use viewport units when needed, but shell boundaries cannot.
