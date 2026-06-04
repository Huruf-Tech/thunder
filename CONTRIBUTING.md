# Contributing to Thunder

First off, thank you for taking the time to contribute! ⚡

Thunder is an open-source, serverless-first API framework for Deno. Whether you're fixing a typo, reporting a bug, improving documentation, or building a new feature, your help is appreciated. This guide explains how to get involved effectively.

By participating in this project, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Conventions](#project-conventions)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Requests](#pull-requests)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Enhancements](#suggesting-enhancements)
- [Contributing Plugins](#contributing-plugins)
- [Community & Questions](#community--questions)

## Ways to Contribute

- 🐛 **Report bugs** and unexpected behavior.
- 💡 **Suggest features** or improvements.
- 📝 **Improve documentation** — including `README.md`, `llms.txt`, and inline guidance.
- 🔧 **Submit code** — bug fixes, new utilities, or framework enhancements.
- 🧩 **Build plugins** that extend Thunder for the wider community.

## Getting Started

1. **Fork** the repository on GitHub and **clone** your fork:

```bash
git clone https://github.com/<your-username>/thunder.git
cd thunder
```

2. **Install [Deno](https://docs.deno.com/runtime/getting_started/installation/)** (v2 or newer). Thunder uses Deno's built-in tooling, so there is no separate package install step.

3. **Set up the project.** Since you cloned/forked an existing repository, run `deno task setup`. It configures your local git settings and the `.githooks` path so the hooks that enforce formatting, linting, and commit conventions work.

```bash
deno task setup
```

> ⚠️ Do **not** run `deno task init` on a clone you intend to contribute from — it resets git history (`rm -rf .git`). That task is only for bootstrapping a brand-new project from the template. Use `deno task setup` instead.

4. **Add a database connection** if you want to run the server locally:

```bash
echo "DATABASE_URL=mongodb://localhost:27017/thunder-dev" > .env
deno task dev
```

## Development Workflow

1. Create a topic branch from `main`:

```bash
git checkout -b fix/router-edge-case
```

2. Make your changes, keeping them focused and scoped to a single concern.

3. **Format and lint** before committing:

```bash
deno task check
```

4. Commit using the [commit message guidelines](#commit-message-guidelines). The `pre-commit` hook runs Deno checks on staged files and the `commit-msg` hook validates your message format.

5. Push your branch and open a pull request against `main`.

## Project Conventions

Thunder has well-established conventions documented in [`llms.txt`](./llms.txt). Please read it before contributing code. Key rules:

- **Never modify `core/` or `plugins/`** in a way that assumes persistence — `core/` is overwritten by `deno task update:core`, and plugins by their update commands. Framework changes to `core/` are reviewed carefully and must remain backward-compatible.
- **Use the `@/` import alias** for project imports — never relative paths into `core/` or `database.ts` (this is enforced by lint plugins).
- **Named functions** are required for routers and handlers; arrow functions are rejected at runtime.
- **TypeScript strict mode** — all code must be properly typed.
- **Validate inputs with Zod**, defining schemas in the prepare phase (outside the request handler).
- **Self-documenting code** — avoid comments that merely restate what the code does. Reserve comments for non-obvious intent or constraints.
- **Named exports** for utilities; **default export** for routers and hooks.

Run `deno task check` and fix any reported issues before pushing.

## Commit Message Guidelines

This project enforces **[Conventional Commits](https://www.conventionalcommits.org/)** via a `commit-msg` git hook. Commits that don't match will be rejected.

**Format:**

```
type(scope)?: subject
```

**Allowed types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `debug`.

The optional `scope` is a short lowercase identifier (letters, numbers, `-`, `_`). Append `!` to signal a breaking change.

**Examples:**

```
feat(router): support optional path segments
fix(env): fall back to .env when ENV_TYPE is unset
docs: clarify plugin lifecycle scripts
chore!: drop support for Deno 1.x
```

Keep the subject concise and in the imperative mood ("add", not "added"). Add a body for additional context when needed.

## Pull Requests

Before submitting, please make sure:

- [ ] Your branch is up to date with `main`.
- [ ] `deno task check` passes (formatting + lint).
- [ ] Commits follow the [Conventional Commits](#commit-message-guidelines) format.
- [ ] The change is focused — unrelated changes belong in separate PRs.
- [ ] Documentation (`README.md` / `llms.txt`) is updated if behavior or conventions changed.
- [ ] You've described **what** changed and **why** in the PR description, linking any related issues.

A maintainer will review your PR, may request changes, and will merge once it's ready. Please be responsive to review feedback and keep discussions respectful.

## Reporting Bugs

Open an issue on [GitHub](https://github.com/Huruf-Tech/thunder/issues) and include:

- A clear, descriptive title.
- Steps to reproduce, with a minimal code sample if possible.
- What you expected to happen vs. what actually happened.
- Your environment: Deno version (`deno --version`), OS, and MongoDB version.
- Any relevant logs or stack traces.

Before filing, search existing issues to avoid duplicates.

## Suggesting Enhancements

Enhancement proposals are welcome. When opening an issue:

- Explain the problem your suggestion solves.
- Describe the proposed solution and any alternatives you considered.
- Note whether you'd be willing to implement it.

Because Thunder intentionally keeps a **minimal core**, many features are best delivered as plugins rather than core changes. Maintainers may suggest the plugin route where appropriate.

## Contributing Plugins

A Thunder project *is* a plugin. To share one with the community:

1. Build it as a normal Thunder project following the conventions in `llms.txt`.
2. Use the naming pattern `thunder-plugin-{feature}` (e.g., `thunder-plugin-stripe`).
3. Document required environment variables in `.env.example` and your `README.md`.
4. Ship an `llms.extension.txt` describing the routes, hooks, models, and env vars your plugin adds (without restating core rules).
5. Publish to GitHub so others can install it with `deno task add:plugin -n your-org/thunder-plugin-feature`.

See the **Plugin Development Guide** section of [`llms.txt`](./llms.txt) for full details, including lifecycle (setup/cleanup) scripts and best practices.

## Community & Questions

- 💬 For questions and discussion, open a [GitHub issue](https://github.com/Huruf-Tech/thunder/issues) with the `question` label.
- 🔒 For security-sensitive reports, please **do not** open a public issue — contact the maintainers privately.

Thank you for helping make Thunder better! ⚡
