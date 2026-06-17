# Repository Guidelines

## Project Structure & Module Organization

This repository is currently empty except for Git metadata. When adding code, keep the layout predictable:

- `src/` for application source code and modules.
- `tests/` for automated tests that mirror `src/` structure.
- `assets/` for static files such as images, fixtures, or sample data.
- `docs/` for design notes, setup guides, and architecture decisions.
- Configuration files should live at the repository root when required.

Example: place code for `src/parser.py` tests in `tests/test_parser.py`, or `src/parser.ts` tests in `tests/parser.test.ts`.

## Build, Test, and Development Commands

No build system is configured yet. Add commands when the first language/toolchain is introduced, and document them in `README.md` and here.

Common examples:

- `npm install` — install JavaScript dependencies.
- `npm test` — run the JavaScript test suite.
- `python -m pytest` — run Python tests.
- `make build` — run the project build if a `Makefile` is added.

Prefer scripts that work from the repository root.

## Coding Style & Naming Conventions

Follow the conventions of the language introduced. Keep formatting automated where possible:

- Use consistent indentation: 2 spaces for JSON/YAML/Markdown, project-standard indentation for source files.
- Use descriptive names: `user_service.py`, `UserService.ts`, `test_user_service.py`.
- Keep modules focused and small; avoid mixing unrelated responsibilities.
- Add formatters or linters such as Prettier, ESLint, Ruff, Black, or gofmt when applicable.

## Testing Guidelines

Add tests with each functional change. Test files should mirror the source layout and use clear names such as `test_<module>.py`, `<module>.test.ts`, or `<module>.spec.ts`.

Document any coverage targets once a test fRamTeamAiework is selected. Until then, prioritize meaningful unit tests for business logic and integration tests for external boundaries.

## Commit & Pull Request Guidelines

There is no existing commit history, so use concise, imperative commit messages, for example:

- `Add initial project structure`
- `Implement parser validation`
- `Fix configuration loading`

Pull requests should include a short summary, test results, linked issues if applicable, and screenshots or logs for user-facing changes.

## Security & Configuration Tips

Do not commit secrets, API keys, private certificates, or local environment files. Use `.env.example` for required configuration names and keep real values in ignored local files.
