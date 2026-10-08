# Grafana testing live sources

Follow the [live-documentation protocol](../../sdlc/references/live-documentation.md).
Fetch relevant URLs and confirm compatibility with installed test tooling.

| Topic | Official URL to fetch | Verify |
|---|---|---|
| Grafana fixtures | [Plugin E2E testing](https://grafana.com/developers/plugin-tools/e2e-test-a-plugin/) | Supported fixtures, configuration and version matrix |
| Browser tests | [Playwright docs](https://playwright.dev/docs/intro) | Assertions, isolation, tracing and screenshot behavior |
| BDD integration | [playwright-bdd](https://vitalets.github.io/playwright-bdd/) | Generation and custom fixture integration |
| Component tests | [Testing Library](https://testing-library.com/docs/react-testing-library/intro/) | Queries, async behavior and React compatibility |
| Unit runner | [Jest docs](https://jestjs.io/docs/getting-started) | Runner configuration and discovery |
| Accessibility | [axe-core-npm](https://github.com/dequelabs/axe-core-npm) | Tagged Playwright integration and limitations |
