> Current navigation contract: [KEYBINDINGS.md](KEYBINDINGS.md). The September 2026 revision uses Ctrl-h/l for Neovim buffers and Ctrl-k/j for tmux windows, keeps split focus behind explicit prefixes, and makes WezTerm a host with explicit utility shortcuts. Dated acceptance below remains historical.

# Development Environment Plan

Status: implemented; acceptance results below are dated historical records
Last updated: 2026-09-10

Current installation, runtime policy, checks, and update procedures: [README.md](README.md).

## North star

Build a reliable, comfortable macOS development environment that becomes an extension of the user rather than another project to learn.

The system should preserve flow: open WezTerm, resume tmux, jump to a project, enter Neovim, and remain there for normal source-code work. Capabilities should use a small, consistent key grammar, be discoverable when forgotten, and behave similarly across languages.

This is a curated, hand-owned IDE-grade Neovim configuration. It is neither a deliberately minimal editor nor an attempt to reproduce every VS Code feature.

## Priorities

1. Stability
2. Discoverability
3. Feature depth
4. Minimal maintenance
5. Startup speed

Prefer mature native functionality and language-server capabilities over overlapping UI plugins. Add a dependency only when it removes meaningful friction or supplies a capability that the existing stack cannot.

## Fixed decisions

- Target Apple Silicon macOS only for now.
- Keep history, configuration, and credentials local.
- Do not add AI completion or AI-generated shell commands.
- Use the current custom Neovim migration as the implementation base; do not reset the worktree to `main`.
- Preserve unrelated existing changes to WezTerm, AeroSpace, tmux, and Git submodules.
- Remove the Neovim Jupyter/Molten/Quarto/Jupytext/image stack.
- Use VS Code as the pragmatic exception for rich `.ipynb` notebook work.
- Keep Neovim hand-built and modular; do not restore LazyVim as a framework.
- Use tmux as the long-running process and shell layer.
- Use Catppuccin Macchiato for the active dark theme and Latte for the optional light theme. The machine-local `dotfiles-theme` file is authoritative for WezTerm, tmux, and Neovim; `theme.conf` only seeds new installations.
- Do not add a general Neovim terminal manager initially.
- Restore Neovim buffers and split layouts per project.
- Keep completion explicit: no preselection, no ghost text, manual selection, Enter to accept.
- Use only a small curated snippet collection.
- Show useful diagnostics inline and retain Trouble as the bottom diagnostics panel.
- Format automatically only in established/configured projects; format loose files explicitly.
- Run only tool-declared safe fixes automatically. Semantic or unsafe fixes require review.
- Support per-project Node versions with a faster replacement for NVM.
- Remove Conda initialization.
- Keep the Zsh experience explicit and Homebrew-managed instead of adding a turnkey shell framework with overlapping features and a separate update path.
- Use a machine-local Java project default and a separately selected Java 21+ runtime for jdtls, through one shared resolver.
- Optimize Scala support for learning and small exercises, not enterprise Scala projects.
- Support SQLite and PostgreSQL; never commit database credentials.
- Use one shared debugger workflow for executable languages with mature adapters; keep project launch details in `.vscode/launch.json` when global discovery is insufficient.

## Implemented system

This document records design scope and historical acceptance; README.md is the current maintenance reference. Future changes should preserve the north star and pass the change-control rule at the end of the document.

- Neovim is a curated, hand-owned IDE rather than a distribution. The configuration is split into core, editor, language, formatting, debugging, Treesitter, workflow, and theme modules.
- Telescope, Neo-tree, Bufferline, persistence, Which-key, Gitsigns, Trouble, and native tmux navigation provide one workspace model without overlapping alternatives.
- Blink supplies explicit LSP/path/buffer/curated-snippet completion. Nothing is preselected, ghost text is off, and Enter only accepts a selected item.
- Native Neovim diagnostics, LSP actions, action previews, workspace rename, inlay hints, and Java refactors provide the code intelligence layer.
- Hardtime runs in non-blocking coaching mode: it suggests more efficient Vim motions during normal work and records locally aggregated hints for an on-demand habit report.
- Python, Go, JavaScript/TypeScript/web, C/C++, Java, Scala, Kotlin, Terraform/HCL, SQL, Markdown, shell, Lua, JSON, YAML, TOML, and XML have syntax and/or language tooling appropriate to their role.
- Conform enforces a strict configured-project boundary. Python uses Ruff safe fixes/imports/formatting; configured ESLint projects apply ESLint-declared fixes before formatting; Go uses goimports/gofumpt; Biome/Prettier, clang-format, Google Java Format, ktlint, SQLFluff, StyLua, Taplo, and shfmt run only when their relevant project declaration is present. Terraform uses its canonical formatter without needing a style file. Loose files format only on explicit request.
- nvim-dap and nvim-dap-view supply one key vocabulary and a temporary bottom-oriented debug view for Python/debugpy, Go/Delve, JavaScript and TypeScript/vscode-js-debug, C/C++/CodeLLDB, Java/jdtls, Scala/Metals, and provisional Kotlin/JVM debugging. Mason owns external adapters; project `.vscode/launch.json` remains the escape hatch for framework-specific launch details.
- Overseer owns one project-aware run interface. It prefers project scripts/build tools and falls back to safe current-file execution where practical. Output is available in the bottom task panel and parsable failures feed quickfix/diagnostics.
- Dadbod supports SQLite/PostgreSQL without committed connection strings. Render Markdown supplies inline editor rendering without rebuilding a notebook stack.
- Zsh uses one cached native completion initialization, fzf-tab, local autosuggestions, syntax highlighting, prefix history search, fzf history/files/directories, zoxide, direnv, and fnm.
- WezTerm, tmux, and Neovim share one Catppuccin mode: Macchiato is the default dark palette and Latte is the prepared light palette.
- Homebrew Python is the system Python, each Mac selects project and jdtls Java runtimes independently through a local profile, fnm owns per-project Node, Coursier/Scala CLI/Metals own Scala learning workflows, and Homebrew provides Kotlin and Terraform CLIs for shell and task use.
- The Brewfile and bootstrap script provision Homebrew, the supported CLI tools, WezTerm, AeroSpace, fonts, runtimes, editor plugins, and pinned tmux plugins while backing up conflicting links before changing them.

Intentional boundaries remain: rich Jupyter notebooks stay in VS Code; tmux owns persistent terminals; Neotest, `refactoring.nvim`, AI completion, and general snippet packs remain deferred. Bash, Terraform, SQL, and data/markup formats intentionally have no DAP because validation and task output fit those workflows better than stepping.

## Desired daily workflow

1. Open WezTerm and attach to a restored tmux session.
2. Jump to a frequently used project with a short directory query.
3. Open Neovim on a directory or file.
4. Navigate primarily through fuzzy finding, with a file tree available for orientation and file operations.
5. Write code with LSP completion, signatures, documentation, imports, diagnostics, and refactoring.
6. Apply safe fixes and project formatting with minimal intervention.
7. Run the current file, project, build, or test through one consistent task interface.
8. Inspect failures in task output, quickfix, or Trouble.
9. Stage, inspect, commit, and manage Git without leaving Neovim.
10. Close or switch projects knowing that buffers, splits, tmux state, and shell history are recoverable.

## Neovim architecture

### Existing foundation to retain

- `lazy.nvim` for explicit plugin management and a committed lockfile
- Native Neovim 0.12 LSP configuration
- `blink.cmp`
- `nvim-treesitter` and text objects
- `conform.nvim`
- Telescope
- Which-key
- Gitsigns
- Trouble
- Catppuccin (Macchiato dark, Latte light)

### Navigation and workspace

- Telescope is the default navigation habit for files, text, buffers, symbols, commands, and keymaps.
- Add a file tree for project context and file operations; it is secondary to fuzzy finding.
- Add a visible buffer line for the active working set.
- Add lightweight project session persistence for buffers and split layout.
- Complete seamless `Ctrl-h/j/k/l` movement across Neovim and tmux using the existing tmux navigation direction.
- Do not reuse `Alt-h/j/k/l`; AeroSpace already owns those bindings.

### Key grammar

Preserve standard Vim motions and use mnemonic leader groups:

- `<leader><space>`: find file
- `<leader>/`: search project text
- `<leader>e`: file tree
- `<leader>f...`: find/search operations
- `<leader>c...`: code actions, refactors, formatting, and symbols
- `<leader>r...`: run/build/test tasks
- `<leader>g...`: Git
- `<leader>x...`: diagnostics and lists
- `<leader>s...`: sessions/workspace state
- `gd`, `gr`, `K`: definition, references, documentation
- `Ctrl-h/j/k/l`: directional split/pane navigation

Which-key descriptions and Telescope keymap search are part of the feature, not decoration. New mappings must fit this grammar and include descriptions.

### Completion

- Sources: LSP, path, buffer, and a curated snippet source.
- Never preselect an item.
- Never insert ghost text.
- Tab and Shift-Tab navigate candidates.
- Enter accepts the explicitly selected item.
- Language-server member completion must work, including methods after `.` and automatic-import candidates.
- Do not install an unfiltered general-purpose snippet collection.
- Begin with only proven snippets such as HTML boilerplate; add more in response to repeated use.

### Diagnostics

- Keep signs, underlines, and severity sorting.
- Show concise inline errors and warnings.
- Show fuller detail for the current line without filling the entire buffer with virtual lines.
- Refresh diagnostics after leaving insert mode or an appropriate idle delay, not on every half-typed token.
- Keep Trouble as the buffer/project-wide bottom panel.
- Avoid an extra diagnostics-rendering plugin unless native Neovim rendering proves inadequate.

### Code actions and refactoring

Actual capability should come from language servers and linters. The editor should provide a predictable, reviewable interface.

Planned actions:

- `<leader>ca`: preview and choose a contextual code action
- `<leader>cA`: apply all safe fixes in the current file
- `<leader>co`: organize imports
- `<leader>cr`: semantic rename across the workspace
- `<leader>cf`: format explicitly

Save pipeline for a configured project:

1. Apply tool-declared safe fixes only.
2. Organize imports.
3. Apply the project-selected formatter.

Loose files do not run this pipeline automatically. Unsafe or semantics-changing actions must be selected manually and should show a diff preview when possible.

Use an LSP code-action previewer backed by the existing Telescope installation. Defer `refactoring.nvim` until language-server refactors have been exercised and a concrete gap is found.

Expected semantic capabilities include:

- Python/Ruff: safe lint fixes, unused imports, modernizations, import organization
- TypeScript/vtsls: add/remove imports, fix-all, extract function/type/interface, move and rewrite operations
- Go/gopls: fill structs/switches, implement interfaces, add tests/tags, extract/inline, organize imports
- Java/jdtls: imports, method/member generation, extract operations, rename, Java test/class execution
- Scala/Metals: Scala-specific quick fixes, imports, missing members, build integration
- C/C++/clangd: include fixes, clang-tidy actions, rename
- Web/Biome or project ESLint: safe correctness, accessibility, complexity, and suspicious-code fixes
- Kotlin/official Kotlin LSP, ktlint, and configured Detekt: compiler feedback, quick fixes, imports, style, and deeper project-declared analysis
- Terraform/terraform-ls and TFLint: validation, references, provider-aware diagnostics, and safe server actions

### Formatting and linting policy

Project configuration wins. Do not force a personal formatter over a repository that declares its own tools.

- Python: Ruff safe fixes, import organization, Ruff formatting
- Go: goimports/gofumpt with gopls
- JavaScript/TypeScript/web: detect project-local Biome or ESLint/Prettier; do not run competing stacks
- C/C++: clang-format when configured
- Java: project formatter or jdtls-compatible formatting; respect Maven/Gradle project conventions
- Scala: Metals/scalafmt
- SQL: dialect-aware explicit formatting/fixing initially; avoid surprise rewrites
- Markdown: project formatter/linter when declared
- Kotlin: ktlint; Detekt diagnostics only when the repository supplies a Detekt configuration
- Terraform: canonical `terraform fmt`; TFLint diagnostics after save
- TOML: Taplo when configured

### Language modules

Support:

- Python
- Go
- JavaScript and TypeScript
- HTML, CSS, and Tailwind
- C and C++
- Java 17 and Spring Boot
- Scala learning projects
- Kotlin/JVM Gradle and Maven projects plus standalone scripts
- Terraform modules and variable files
- SQL for SQLite and PostgreSQL
- Markdown
- JSON and common configuration formats
- Shell scripts

Language-specific complexity must live in separate modules and load only for relevant filetypes/projects.

Java policy:

- Project/standalone default: explicit version, then JAVA_HOME, then newest installed JDK; project build toolchains win
- jdtls launcher runtime: explicit independent version or newest installed JDK, requiring Java 21+
- Missing explicit runtime choices fail; discovered JDK paths are preserved
- Prefer Maven/Gradle wrappers from the repository
- Configure a persistent, project-specific jdtls workspace directory

Scala policy:

- Prefer Scala CLI plus Metals/Coursier for exercises and learning.
- Do not force the globally installed Scala 2.12 onto every project.

SQL policy:

- Use a database-aware UI and completion for SQLite and PostgreSQL.
- Keep connection definitions and secrets in a local ignored file or environment variables.
- Support executing the current statement or visual selection.

Markdown policy:

- Provide in-Neovim rendering for headings, lists, tables, code blocks, links, and LaTeX where practical.
- Do not rebuild the removed notebook stack indirectly through Markdown plugins.

Kotlin policy:

- Use JetBrains' official `kotlin-lsp`; it is the best maintained option but remains Alpha, so keep the configuration isolated and easy to replace.
- Use ktlint as the default style formatter/linter and run Detekt only when the repository supplies its configuration.
- Prefer Gradle/Maven wrappers for projects. Use the Homebrew Kotlin CLI only for standalone files and scripts.

Terraform policy:

- Use HashiCorp `terraform-ls`, the official Terraform CLI, `terraform fmt`, and TFLint.
- Treat `validate`, `plan`, tests, and `TF_LOG` as the debugging workflow; never add a Terraform DAP adapter.
- Do not run `terraform init`, `plan`, or `apply` automatically from an editor save hook.

### Tasks and code execution

Use one project-aware task interface rather than unrelated per-language runner keymaps.

Habitual operations:

- `<leader>rr`: run the most sensible default for the current context
- `<leader>rt`: select a task
- `<leader>rl`: repeat the last task
- `<leader>ro`: show or focus task output

The implementation may use Overseer, with small custom templates where project discovery is insufficient.

Expected defaults:

- Python: current script or project task
- JavaScript/TypeScript: project script first; current file for standalone scripts
- Go: containing package/project
- C/C++: project build first; compile/run current file only when standalone
- Java: current main/test class or Maven/Gradle/Spring task
- Scala: Scala CLI or project task
- SQL: current statement/selection through the configured database connection
- Kotlin: Gradle/Maven project task first; Kotlin CLI for standalone files and scripts
- Terraform: validate the current module; initialization, plan, and apply remain explicit project tasks

Compiler, linter, and test output should feed quickfix/diagnostics when parsable.

### Git

- Retain Gitsigns for hunks, previews, blame, and small edits.
- Use the already-installed LazyGit for full repository workflows.
- Open LazyGit inside a native Neovim terminal tab/window with one mapping.
- Do not add Neogit or Fugitive initially.

### Terminal and debugging

- tmux owns persistent shells, servers, and REPLs.
- Neovim tasks own normal build/run/test commands.
- Native `:terminal` is sufficient for temporary terminal TUIs such as LazyGit.
- Do not add ToggleTerm or another terminal manager initially.
- Use nvim-dap with a UI that opens for active sessions and closes when they end.
- Debug Python, Go, JavaScript/TypeScript, C/C++, Java, Scala, and Kotlin through their established adapters; Kotlin support is provisional and requires a compiled Gradle/Maven project.
- Gradle projects must carry their own `gradlew`; Maven projects can use `mvnw` or the provisioned Maven. Build Kotlin projects before debugging them.
- Run Java tests through the project task workflow for now. The current released Java Test extension requires an ASM version excluded by current JDTLS 1.60, so its test-debug bundle is deliberately not loaded; Java main-class debugging remains enabled.
- Reuse `.vscode/launch.json` for per-project arguments, environments, remote targets, and framework-specific launch behavior.
- Keep Bash, Terraform, SQL, and data/markup formats on lint/validate/task workflows instead of adding low-value adapters.

### Explicitly deferred or excluded

- AI completion and AI commands
- Rich `.ipynb` notebook support in Neovim
- Molten, Quarto, Jupytext, and terminal image rendering
- A Neovim distribution such as LazyVim
- A general terminal-management plugin
- Neotest until task-based test execution proves insufficient
- `refactoring.nvim` until LSP refactoring gaps are demonstrated
- Multiple overlapping file trees, fuzzy finders, Git UIs, completion engines, or formatters

## Zsh architecture

### Configuration ownership

- Move zsh configuration into this repository and manage it through the bootstrap process.
- Keep environment resolution in one shared module sourced by both login and interactive shells.
- Keep the machine-profile interface declarative: Java default plus optional PATH prepend/append arrays.
- Keep machine preferences in `~/.config/dotdotdot/machine.zsh` and secrets or one-off interactive customizations in `~/.config/zsh/local.zsh`.
- Keep startup idempotent: nested shells must not duplicate PATH or `fpath` entries.

### Completion and interaction stack

- Native zsh completion remains the source of truth.
- Initialize `compinit` exactly once and use a cached dump safely.
- Add `fzf-tab` for grouped fuzzy Tab selection and descriptions.
- Add `zsh-autosuggestions` using local history/completion data.
- Add `zsh-syntax-highlighting`.
- Use fzf for local `Ctrl-R` history search.
- Add zoxide for learned directory jumping.
- Add command-specific completions when a real gap is observed; do not install competing completion frameworks by default.
- Keep reusable command snippets as explicit aliases/functions at first.

### History

- Remain local-only.
- Increase history substantially.
- Deduplicate while preserving useful recency.
- Share history safely between tmux shells.
- Avoid recording obvious sensitive commands where practical.
- Do not add cloud synchronization or an AI command generator.

### Runtime and PATH policy

- Replace NVM with `fnm` for fast per-project Node switching.
- Remove Conda initialization.
- Keep Homebrew Python as the default Python.
- Use virtual environments for Python projects.
- Honor machine-local Java choices and select the Java 21+ jdtls launcher independently; do not force a shell JAVA_HOME.
- Retain Go.
- Retain Coursier and use Scala CLI/Metals for Scala learning.
- Keep Bun only if an actual Bun project requires it.
- Keep Cargo only if Rust or cargo-installed tools require it; otherwise migrate those tools to Homebrew before removing it.
- Remove legacy Ruby and gem PATH additions unless Ruby development becomes an explicit requirement.
- Remove stale Fig integration and duplicate Homebrew initialization.
- Add direnv shell integration only if project-local environment files provide clear value.

### Prompt

- Powerlevel10k may remain if it is reliable after startup cleanup.
- Prompt replacement is not a goal by itself.
- Prompt segments should expose useful state without running expensive language/version checks unnecessarily.

## Implementation phases

### Phase 0: protect scope (complete)

- Record the pre-existing dirty state.
- Do not reset to `main` or discard unrelated changes.
- Treat the current custom Neovim migration as the base.
- Avoid committing or staging unrelated files.

### Phase 1: stable Neovim core (complete)

- Remove notebook-related modules and dependencies.
- Repair current health/configuration issues.
- Add file tree, buffer line, inline diagnostics, code-action preview, and session persistence.
- Complete Neovim/tmux navigation.
- Normalize mappings and Which-key groups.

### Phase 2: languages, fixes, and formatting (complete)

- Build modular language configurations.
- Implement safe-fix/import/format policy.
- Add Java 17 project support with Java 21 jdtls launcher.
- Add lightweight Scala/Metals support.
- Add SQLite/PostgreSQL tooling.
- Add Markdown rendering.
- Verify completion, diagnostics, actions, rename, and formatting with representative files.

### Phase 3: tasks and Git (complete)

- Add the shared task interface and language/project templates.
- Route parsable failures into quickfix or diagnostics.
- Add the native-terminal LazyGit entry point.
- Verify run/build/test habits across representative languages.

### Phase 4: zsh and bootstrap (complete)

- Add repo-owned zsh files and safe bootstrap links/backups.
- Clean PATH and runtime initialization.
- Add local completion/suggestion/history/navigation tools.
- Replace NVM with fnm and remove Conda initialization.
- Measure startup and eliminate duplicate initialization.

### Phase 5: verification and documentation (complete)

- Run Neovim headless startup and health checks.
- Test real interactive files for every supported language.
- Test tmux navigation, session restore, Git, SQL, and task flows.
- Measure Neovim and warm zsh startup.
- Document the small habitual key set and maintenance/update procedure.
- Review every dependency against the north star and remove unjustified overlap.

### Phase 6: cross-Mac portability (complete)

- Centralize Homebrew, PATH, and Java resolution behind the machine-profile interface.
- Make both login shells and tmux child shells resolve the receiving Mac's preferences.
- Teach Neovim to consume the resolved Java default without changing its shared editor logic.
- Provision Homebrew, WezTerm, AeroSpace, tmux, Neovim, the shared prompt, fonts, CLI tools, runtimes, language tools, and optional machine-only packages from bootstrap.
- Add dry-run and read-only doctor paths, then test fresh-home and Java 17/21 adapters.

### Phase 7: Terraform, Kotlin, and debugging (complete)

- Add official Terraform and Kotlin language servers, parsers, formatting, linting, and current-context tasks.
- Add SchemaStore catalogs for JSON/YAML and update Metals to the current stable release.
- Add one discoverable DAP workflow for mature executable-language adapters, with Kotlin marked provisional.
- Provision the added CLIs, Mason tools, adapters, plugins, and parsers from bootstrap.

## Daily muscle memory

Press `<Space>` and pause whenever a mapping is forgotten; Which-key shows the available groups. `<leader>fk` searches every keymap by description, which is the primary discoverability escape hatch.

### Navigation

- `<leader><space>` finds files; `<leader>/` searches project text.
- `<leader>e` toggles the file tree; `-` reveals the current file in it.
- `[b` and `]b` move through open buffers; `<leader><Tab>` returns to the alternate buffer.
- `Ctrl-h/j/k/l` moves through Neovim splits and adjacent tmux panes with the same habit.
- `<leader>sl` restores the current-directory session; `<leader>ss` selects another session. Opening Neovim on a directory restores that project automatically.
- `<leader>vr` opens the ranked Vim habit report; `<leader>vt` temporarily toggles motion coaching. Coaching is deliberately non-blocking: inefficient movement still works while Hardtime suggests a better motion.

### Code

- `gd`, `gr`, `K`, and `gK` show definition, references, documentation, and signature help.
- `<leader>ca` previews contextual actions; `<leader>cA` requests tool-declared safe fixes; `<leader>co` organizes imports.
- `<leader>cr` renames across the workspace; `<leader>cf` explicitly formats any file.
- `<leader>cl` runs a language-server code lens, including Scala and Java run/debug lenses when offered.
- `[d` and `]d` move through diagnostics; `<leader>cd` explains the current line; `<leader>xx` opens workspace diagnostics and `<leader>xX` limits them to the buffer.
- In completion, `Tab`/`Shift-Tab` choose an item, Enter accepts it, and `Ctrl-e` closes the menu. Enter falls through normally when nothing is selected.
- In Java, `<leader>cjo` organizes imports and `<leader>cjv`/`<leader>cjm` extract a variable/method. Language-server actions remain available through `<leader>ca` in every supported language.

### Run, Git, and data

- `<leader>rr` runs the current context; `<leader>rt` chooses a project task; `<leader>rl` repeats; `<leader>ro` toggles task output.
- `<leader>gg` opens LazyGit in a temporary Neovim terminal tab. `[h`/`]h` move through changed hunks and `<leader>h...` exposes focused hunk operations.
- In SQL, `<leader>db` opens the database UI, `<leader>de` runs the blank-line-delimited current statement or visual selection, and `<leader>dE` runs the buffer.
- Markdown rendering starts automatically; use `:RenderMarkdown toggle` when literal source is preferable.

### Debug

- `<leader>Dt` toggles a breakpoint; `<leader>Dc` starts or continues the current language's debugger.
- `<leader>Do`, `<leader>Di`, and `<leader>DO` step over, into, and out. `<leader>DP` pauses and `<leader>Dq` terminates.
- `<leader>Du` toggles the debug panels; `<leader>De` evaluates the expression under the cursor or visual selection; `<leader>Dr` toggles the REPL.
- `<leader>Dpn`/`<leader>Dpc` debug the nearest Python test or class, and `<leader>Dgt` debugs the nearest Go test. Use `<leader>rr` for Java tests until the upstream Java Test/JDTLS bundle versions converge.
- `:DapLoadLaunchJSON` loads a project's `.vscode/launch.json` when the default current-file/package discovery is not enough.

### Shell

- `Tab` opens fuzzy native completion; Enter chooses the highlighted result.
- `Ctrl-R` searches local history, `Ctrl-T` inserts a file, and `Alt-C` changes to a selected directory.
- Up/Down searches history using the text already typed.
- `Ctrl-F` accepts a full local suggestion; `Alt-F` advances by a word.
- `cd` learns frequently used directories through zoxide. Use `cdi` for an interactive learned-directory picker.
- Node changes automatically when an ancestor contains `.node-version` or `.nvmrc`; `fnm use <version>` handles an explicit switch.

## Maintenance, local state, and rollback

### First install or relink

From this repository:

```sh
./bootstrap.sh --dry-run --install
./bootstrap.sh --install
./bootstrap.sh --check
```

On a fresh Apple Silicon Mac, bootstrap requests Apple's Command Line Tools if necessary, installs Homebrew from its official installer, installs the shared Brewfile (including WezTerm, AeroSpace, Maple Mono, tmux, Neovim, zsh tools, Kotlin, Terraform, runtimes, and build tools), initializes pinned tmux plugins, links the configs, installs default Node and Scala CLI/Metals, restores Neovim plugins (including lazy.nvim itself) to the committed lockfile, and installs Mason tools, debug adapters, and configured Treesitter parsers. Existing conflicting paths move to `~/.dotfiles-backups/<timestamp>/` before linking. The final command reports missing dependencies, incorrect links, Java selection, and submodule drift without changing the machine.

Java selection follows the policy in README.md. Before installation, a Mac can declare its local JDK preferences:

```sh
mkdir -p ~/.config/dotdotdot
cp zsh/machine.example.zsh ~/.config/dotdotdot/machine.zsh
/usr/bin/vi ~/.config/dotdotdot/machine.zsh
```

The profile and optional `~/.config/dotdotdot/Brewfile.local` are never linked or overwritten by bootstrap.

### Deliberate updates

Do not update tools automatically during ordinary editor startup. Use this sequence when there is time to verify the result:

1. WezTerm uses the nightly cask; update it explicitly with `brew upgrade --cask wezterm@nightly --greedy-latest`. Run `brew update`, then `brew bundle check --no-upgrade --file Brewfile`; use `brew upgrade <name>` only for tools intentionally being upgraded.
2. In Neovim, run `:Lazy check`, review the candidates, then `:Lazy update`. Review the `nvim/lazy-lock.json` diff.
3. Run `:MasonToolsUpdate` and `:TSUpdateConfigured` only when language tools/parsers should move.
4. Restart Neovim, run `:checkhealth`, open a representative project, confirm completion/diagnostics, and run `<leader>rr`.
5. After installing/removing a CLI with zsh completions, run `comp-rebuild` once.

For a new Node release, use `fnm install <version>` and choose a per-project version file. Python projects should use a local virtual environment; do not add a global Python manager unless a concrete incompatible-version need appears.

### Machine-local configuration and secrets

- Put per-Mac Java and PATH preferences in `~/.config/dotdotdot/machine.zsh`, using `zsh/machine.example.zsh` as the interface reference. It is sourced early and remains outside this repository.
- Put secrets, aliases, and other one-off interactive shell behavior in `~/.config/zsh/local.zsh`. It is sourced after fnm/direnv/zoxide and remains outside this repository.
- Put optional per-Mac Homebrew declarations in `~/.config/dotdotdot/Brewfile.local`; the tracked Brewfile remains the common baseline.
- Set `DATABASE_URL` or `SQLITE_DATABASE` locally for a default database.
- For named Dadbod connections, create `~/.config/nvim-local/db.lua` and assign `vim.g.dbs`; never place passwords or connection strings in this repository.
- Hardtime keeps its local-only habit history at `~/.local/state/nvim/hardtime.nvim.log`. Removing that file resets the report.
- Direnv is enabled, but `.envrc` still requires explicit `direnv allow` per project. Commit only non-secret `.envrc` logic.

### Rollback

- For a plugin regression, restore `nvim/lazy-lock.json` from the last known-good Git revision and run `:Lazy restore`.
- For a configuration regression, inspect the Git diff and restore only the affected owned files; do not reset unrelated WezTerm, AeroSpace, tmux, or submodule work.
- To leave repo-managed zsh, unlink `~/.zprofile`/`~/.zshrc` and restore the corresponding files from the timestamped backup directory.
- Mason tools and Treesitter parsers live under Neovim data directories, so removing/reinstalling one does not alter project source.

## Verification record

Verified on macOS arm64 on 2026-07-14:

- Clean Lua, zsh, Bash, JSON, ShellCheck, shfmt, and `git diff --check` validation; clean headless and UI Neovim startup.
- Health has no configuration-owned errors. The remaining Mason PHP/Composer/Julia notices concern intentionally unsupported languages; Blink's dynamic-provider notice is informational.
- Real LSP attachment for Python/Pyright/Ruff, Go/gopls, JavaScript/vtsls, C/clangd, Markdown/Marksman, Java/jdtls, Scala/Metals, Bash/BashLS+ShellCheck, YAML/YAML LS, and TOML/Taplo.
- Python member completion returned methods after `.`, and workspace rename changed references across multiple files.
- Configured Python, JavaScript, C, and Java files formatted; matching loose Python/JavaScript files remained byte-for-byte unformatted until explicit formatting.
- A configured ESLint rule performed a real fix-on-save (`let` to `const`) before Prettier formatted the file.
- Python, Go, JavaScript, C, Java, and Scala ran successfully through `<leader>rr`; project `npm start` discovery also succeeded.
- SQLFluff reported deliberate SQL errors and Dadbod executed a real SQLite query.
- Project sessions restored two buffers and their split layout. An isolated tmux server loaded all four cross-pane navigation bindings.
- Seven warm Neovim starts had a 70 ms median; seven zsh starts had a 130 ms median, comfortably below the 500 ms requirement.

Cross-Mac portability was reverified on macOS arm64 on 2026-08-04:

- The full `./bootstrap.sh --install` path completed twice, with the second run confirming idempotent links, dependencies, runtimes, language tools, and doctor results.
- A clean-home dry run exercised the new-Mac Homebrew, dependency, submodule, link, runtime, and editor provisioning sequence without changing that home.
- A clean Neovim data directory restored every plugin from `lazy-lock.json`, including lazy.nvim's own pinned revision, without changing the lockfile.
- Default Java 17 and a machine-local Java 21 profile both produced an idempotent PATH, the matching `JAVA_HOME`, and the matching Neovim project runtime.
- Live Neovim started cleanly with `catppuccin-macchiato`; syntax, ShellCheck, shfmt, StyLua, JSON, and Git whitespace checks passed.

Terraform, Kotlin, and debugging were acceptance-tested on macOS arm64 on 2026-08-04:

- The full bootstrap installed the added Mason tools and adapters, Terraform/Kotlin/HCL parsers, Metals 1.6.8, Kotlin, and current Terraform 1.15.8; its final doctor passed every declared dependency and link.
- Real Terraform and Kotlin buffers attached `terraformls` and JetBrains `kotlin_lsp`. Terraform fmt/validate/TFLint and Kotlin ktlint/compile/run passed on disposable projects.
- Neovim resolved both new Conform formatters and nvim-lint integrations, including project-gated Detekt.
- Real nvim-dap sessions completed for Python/debugpy, Go/Delve, JavaScript/vscode-js-debug, C/CodeLLDB, Java/JDTLS, Scala/Metals, and Kotlin/Kotlin Debug Adapter. The JavaScript adapter is explicitly bound to IPv4 to avoid macOS localhost resolving its server and client to different address families.
- Kotlin DAP passed against a compiled Maven project. A Gradle fixture without `gradlew` was rejected with a focused preflight message, preserving project-owned Gradle versions.
- The released Java Test bundle failed to resolve against JDTLS 1.60's ASM bundle. It was removed from the active configuration while Java main-class DAP remained acceptance-tested; Maven/Gradle tasks remain the stable Java test path.

## Acceptance criteria

### Neovim

- Starts without errors in headless and interactive modes.
- No configuration-owned health errors remain.
- Completion does not preselect or show ghost text; Enter accepts only the chosen item.
- Member completion and automatic-import candidates work in supported languages.
- Errors and warnings appear inline without overwhelming the buffer.
- Trouble shows current-buffer and workspace diagnostics.
- Contextual code actions show a preview where edits are available.
- Safe fixes and import organization run automatically only in configured projects.
- Loose files are not unexpectedly rewritten.
- Workspace rename changes references across files where the language server supports it.
- Project formatting respects repository configuration.
- Telescope, the file tree, buffer line, and sessions form one coherent navigation model.
- `Ctrl-h/j/k/l` crosses Neovim and tmux pane boundaries predictably.
- A default task can run from the same mapping across supported languages.
- Build/test failures are easy to navigate.
- LazyGit opens and returns to editing without leaving Neovim.
- A project session restores buffers and split layout.
- Markdown renders usefully inside Neovim.
- SQLite and PostgreSQL queries can be executed without storing secrets in Git.
- Terraform and Kotlin attach their intended language servers and expose formatting, linting, and current-context tasks.
- Debug start/continue, breakpoints, stepping, evaluation, and session cleanup share one mapping vocabulary across supported executable languages.

### Zsh

- `compinit` runs once.
- Tab opens a useful grouped fuzzy completion interface.
- Inline suggestions are derived locally and are easy to accept partially or fully.
- `Ctrl-R` searches local history fuzzily.
- Directory jumping learns local usage.
- Nested shells do not multiply PATH entries.
- Node versions switch per project without NVM startup cost.
- Shell JAVA_HOME is machine-owned; Neovim and bootstrap share the validated project/launcher runtime resolver.
- Conda, Fig, and legacy Ruby initialization are absent.
- Median warm interactive startup should be at most 500 ms unless a measured, user-valued feature justifies more.

### Maintenance

- Plugin commits are locked; tool builds and deliberate upgrades are recorded and checked (Homebrew/Mason are not a complete version lock).
- Updates are deliberate, not automatic on editor startup.
- The bootstrap process backs up conflicts before linking.
- Bootstrap can provision a fresh Apple Silicon Mac from Homebrew through editor and language dependencies, and `--check` reports drift afterward.
- A short maintenance document explains how to update, verify, and roll back.
- No cloud dependency, secret, or private connection string is committed.

## Change-control rule

Before adding a plugin or shell tool, answer all three:

1. Which accepted workflow or acceptance criterion does it satisfy?
2. Can the same outcome be achieved reliably with an existing dependency or native feature?
3. Does its ongoing maintenance cost fit the priority order?

If the first answer is unclear, or the second answer is yes without a meaningful loss of usability, do not add it.
