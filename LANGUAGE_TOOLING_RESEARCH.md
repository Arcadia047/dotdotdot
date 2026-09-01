# Neovim Language Tooling Research

Status: implementation guidance  
Research date: 2026-08-04  
Platform: Apple Silicon macOS, Neovim 0.12, Mason-managed editor tools

## Decision standard

Here, "best" means actively maintained, well supported by Neovim, aware of the
project's own configuration, and unlikely to require frequent editor-specific
repairs. GitHub star counts are not useful across different tool categories and
are not the deciding factor. Prefer first-party servers and adapters, then mature
community integrations. Never run two tools that own the same diagnostics or
formatting role unless they are intentionally complementary.

The existing foundation is sound. Pyright plus native Ruff, gopls, vtsls,
project-local ESLint/Biome, clangd, jdtls, Metals, BashLS, Marksman, the VS Code
HTML/CSS/JSON servers, YAML Language Server, and Taplo should remain. The most
important gaps are Terraform/HCL, Kotlin, schema catalogs for JSON/YAML, and a
single DAP workflow for executable languages.

Mason package names and versions below were checked against the official local
registry snapshot `2026-08-04-poised-table`. The authoritative metadata is the
[Mason registry](https://github.com/mason-org/mason-registry); representative
manifests include
[kotlin-lsp](https://github.com/mason-org/mason-registry/blob/main/packages/kotlin-lsp/package.yaml),
[terraform-ls](https://github.com/mason-org/mason-registry/blob/main/packages/terraform-ls/package.yaml),
[debugpy](https://github.com/mason-org/mason-registry/blob/main/packages/debugpy/package.yaml),
and
[codelldb](https://github.com/mason-org/mason-registry/blob/main/packages/codelldb/package.yaml).

## Recommended editing stack

| Language | LSP | Lint and format | Recommendation and current gap |
|---|---|---|---|
| Python | `pyright` plus `ruff` | Ruff safe fixes, import organization, and formatting | Keep. Pyright is Microsoft's full-featured standards-based type checker; Ruff's native server is stable and is designed to run beside another Python LSP. Do not add BasedPyright unless a concrete Pyright gap appears, and never run both. Mason: `pyright`, `ruff`. [Pyright](https://github.com/microsoft/pyright#readme), [Ruff editor integration](https://docs.astral.sh/ruff/editors/), [Ruff migration](https://docs.astral.sh/ruff/editors/migration/) |
| Go | `gopls` | gopls analysis plus `goimports` and `gofumpt` | Keep. gopls already reports compiler errors, `go vet`, and Staticcheck analyzers; the current `staticcheck = true` enables the full suite. Add `golangci-lint` only for repositories that declare its config because its broader policy is project-owned, not a universal editor default. Mason: `gopls`, `goimports`, `gofumpt`; optional `golangci-lint`. [gopls diagnostics](https://go.dev/gopls/features/diagnostics), [gopls analyzers](https://go.dev/gopls/analyzers) |
| JavaScript/TypeScript | `vtsls` | exactly one configured project stack: ESLint plus Prettier, or Biome | Keep the current project-conditional policy. vtsls closely mirrors VS Code's TypeScript extension and supports its refactors, though upstream calls it best-effort rather than absolutely robust. `ts_ls` is the fallback if reliability problems actually occur. ESLint should resolve the repository's own ESLint library; do not make a global rule set silently govern projects. Mason: `vtsls`, `eslint-lsp`, `biome`, `prettier`. [vtsls](https://github.com/yioneko/vtsls#readme), [ESLint language server](https://github.com/microsoft/vscode-eslint#readme), [Biome](https://github.com/biomejs/biome#readme) |
| HTML/CSS/Tailwind/Emmet | `html`, `cssls`, `tailwindcss`, `emmet_language_server` | project Prettier/Biome; Stylelint only when declared | Keep the existing servers. Add Stylelint diagnostics only when a repository has a Stylelint config and dependency; otherwise CSSLS diagnostics plus the project's build are the low-noise baseline. Mason: existing four servers; optional `stylelint`. [VS Code language servers](https://github.com/hrsh7th/vscode-langservers-extracted#readme), [Tailwind language server](https://github.com/tailwindlabs/tailwindcss-intellisense#readme), [Emmet language server](https://github.com/olrtg/emmet-language-server#readme) |
| Bash | `bashls` | ShellCheck and shfmt | Keep. BashLS automatically calls ShellCheck when it is on `PATH`, so a second nvim-lint invocation would duplicate diagnostics. The Brewfile already supplies ShellCheck; Mason may install it instead, but should not shadow a different duplicate. Mason: `bash-language-server`, `shfmt`; `shellcheck` only if Homebrew stops owning it. [BashLS](https://github.com/bash-lsp/bash-language-server#readme), [ShellCheck](https://github.com/koalaman/shellcheck#readme), [shfmt](https://github.com/mvdan/sh#shfmt) |
| C/C++ | `clangd` | clangd's embedded clang-tidy plus clang-format | Keep. The current `--clang-tidy` flag is the appropriate live analyzer and respects project `.clang-tidy`; formatter activation should continue to require `.clang-format`. Mason has no separate clang-tidy package. Mason: `clangd`, `clang-format`. [clangd features](https://clangd.llvm.org/features) |
| Java/Spring Boot | `jdtls` via `nvim-jdtls` | jdtls/project formatter; Checkstyle, SpotBugs, or Error Prone through Maven/Gradle | Keep jdtls as the owner. It provides as-you-type compile errors, Maven/Gradle import, formatting, quick fixes, and refactors. Load `java-debug-adapter` for main-class debugging. The acceptance test found the current released `java-test` bundle incompatible with current JDTLS 1.60's ASM version, so keep Java test debugging disabled until a compatible release is available and run tests through Maven/Gradle tasks. Do not globally impose Checkstyle or Google Java Format; activate them only when the build declares them. Spring Boot Tools is an optional extension bundle, not a standalone executable, and should wait for a demonstrated gap in Spring property/navigation support. Mason: `jdtls`, `google-java-format`, `java-debug-adapter`; optional after compatibility is restored: `java-test`, `checkstyle`, `vscode-spring-boot-tools`. [Eclipse JDT LS](https://github.com/eclipse-jdtls/eclipse.jdt.ls#readme), [nvim-jdtls](https://github.com/mfussenegger/nvim-jdtls#readme) |
| Scala | Metals | Metals/Scalafmt and project Scalafix | Keep Coursier installation because Mason has no Metals or Scalafmt packages. Upgrade the pinned stable Metals 1.6.7 to 1.6.8; 1.6.8 was the current stable release on 2026-07-23. Metals already supplies code actions, Scalafmt integration, and Scala-aware diagnostics. [Metals editor support/current version](https://scalameta.org/metals/docs/), [Metals code actions](https://scalameta.org/metals/docs/features/codeactions) |
| SQL: SQLite/PostgreSQL | Dadbod completion; no global LSP | SQLFluff only with an explicit dialect/config | Keep the current conservative baseline. `sqls` supports both databases but explicitly has no stable release and requires a connection containing potentially sensitive details. `postgres-language-server` is substantially stronger for PostgreSQL but is dialect-specific and should attach only in repositories known to be PostgreSQL. Do not attach both globally to generic `sql` buffers. No SQL DAP exists. Mason: `sqlfluff`; optional per-project `postgres-language-server` or `sqls`. [sqls status and database requirement](https://github.com/sqls-server/sqls#readme), [Postgres Language Server](https://github.com/supabase-community/postgres-language-server#readme), [SQLFluff](https://github.com/sqlfluff/sqlfluff#readme) |
| Markdown | `marksman` | Prettier or markdownlint-cli2 only when configured | Keep Marksman for links, references, rename, and diagnostics. Markdown Oxide is a PKM/Obsidian-focused alternative, not an upgrade for ordinary project Markdown. `render-markdown.nvim` is presentation, not validation. Mason: `marksman`; optional `markdownlint-cli2`, `prettier`. [Marksman](https://github.com/artempyanykh/marksman#readme), [Markdown Oxide scope](https://github.com/Feel-ix-343/markdown-oxide#readme), [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2#readme) |
| JSON/YAML | `jsonls`, `yamlls` plus SchemaStore.nvim | project Prettier/Biome; YAML LS validation | Keep the servers and add SchemaStore.nvim so common files receive maintained JSON/YAML schemas without hand-copying catalogs. This improves completion and diagnostics without a second server. Optional yamllint is redundant unless a project explicitly requires its style rules. [SchemaStore.nvim](https://github.com/b0o/SchemaStore.nvim#readme), [YAML Language Server](https://github.com/redhat-developer/yaml-language-server#readme) |
| TOML | `taplo` | Taplo | Keep Taplo and use its formatter when a Taplo/project configuration exists. No separate linter or DAP is needed. Mason: `taplo`. [Taplo](https://github.com/tamasfe/taplo#readme) |
| Terraform/HCL | `terraformls` plus project-aware `tflint` | `terraform fmt`; TFLint diagnostics/fixes | Add. `terraform-ls` is HashiCorp's official server; TFLint supplies provider-aware mistakes, deprecations, unused declarations, and project rules. The Terraform CLI is required for meaningful validation and formatting and should be installed system-wide or by a project version manager, not treated as an editor-only dependency. Mason: `terraform-ls`, `tflint`; install Terraform CLI outside Mason. Standalone non-Terraform HCL has `hclfmt` but no general mature HCL LSP. No DAP is useful. [terraform-ls](https://github.com/hashicorp/terraform-ls#readme), [TFLint](https://github.com/terraform-linters/tflint#readme), [terraform fmt](https://developer.hashicorp.com/terraform/cli/commands/fmt), [terraform validate](https://developer.hashicorp.com/terraform/cli/commands/validate) |
| Kotlin/JVM | official `kotlin_lsp` | ktlint; Detekt only when project-configured | Add with an explicit maturity warning. JetBrains' IntelliJ-powered server supports current Kotlin, Gradle/Maven JVM projects, completion, diagnostics, quick fixes, imports, rename, and formatting, but upstream still labels it Alpha. The older `fwcd/kotlin-language-server` now declares itself deprecated, so it is not the stability fallback. Ktlint is the low-friction formatter/style linter; Detekt adds deeper static analysis and should run only when the project declares it. Mason: `kotlin-lsp`, `ktlint`, `detekt`. [official Kotlin LSP](https://github.com/Kotlin/kotlin-lsp#readme), [deprecated community server](https://github.com/fwcd/kotlin-language-server#readme), [ktlint](https://github.com/ktlint/ktlint#readme), [Detekt](https://detekt.dev/) |

### Important overlaps and deprecations

- Native `ruff server` is the supported Ruff LSP. `ruff-lsp` is deprecated; do
  not install or configure it.
- Choose Pyright or BasedPyright, never both. Keep Pyright until there is a
  concrete feature need because it is already working and first-party.
- Choose the repository's ESLint/Prettier stack or Biome stack. Do not produce
  duplicate lint findings or run two formatters on one save.
- Use `delve` directly for Go DAP. Mason's `go-debug-adapter` wraps the VS Code Go
  extension and adds no value to `nvim-dap-go`.
- `terraform-lsp` is the obsolete predecessor; use HashiCorp `terraform-ls` and
  Neovim's config name `terraformls`.
- `kotlin-language-server` is deprecated upstream; use Mason `kotlin-lsp` and
  Neovim's config name `kotlin_lsp`, accepting the official server's Alpha status.
- Do not make `sqls` and Postgres Language Server global simultaneous owners of
  every SQL buffer. Dialect and connection selection must be project-local.

## Debugging stack

Use one client and one discoverable key vocabulary across languages:

- [`mfussenegger/nvim-dap`](https://github.com/mfussenegger/nvim-dap#readme)
  is the mature core DAP client.
- [`igorlfs/nvim-dap-view`](https://github.com/igorlfs/nvim-dap-view#readme)
  is the leanest fit for this configuration: one bottom-oriented view for
  scopes, call stack, breakpoints, watches, and REPL, with inline values. It
  avoids combining a permanent IDE layout, dap-ui, and a separate virtual-text
  plugin. If long-term experience exposes a missing panel, nvim-dap-ui remains
  the established heavier alternative.
- Reuse `nvim-dap`'s `.vscode/launch.json` support for project-specific launch
  details instead of encoding every framework in the global dotfiles.

| Language | Adapter | Mason package | Integration policy |
|---|---|---|---|
| Python | Microsoft's debugpy | `debugpy` | Use `nvim-dap-python` for `.venv` selection and nearest test/class helpers. The adapter environment is independent from the project's debuggee interpreter. [debugpy](https://github.com/microsoft/debugpy#readme), [nvim-dap-python](https://github.com/mfussenegger/nvim-dap-python#readme) |
| Go | Delve DAP | `delve` | Use `nvim-dap-go` for package/test discovery and attach. Delve is the Go source debugger and implements DAP directly. [Delve DAP](https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md), [nvim-dap-go](https://github.com/leoluz/nvim-dap-go#readme) |
| JavaScript/TypeScript | Microsoft's VS Code JavaScript debugger | `js-debug-adapter` | Configure Mason's adapter directly as `pwa-node`/browser types. Avoid the lightly maintained `nvim-dap-vscode-js` wrapper; its own documentation still depends on upstream build details. [vscode-js-debug](https://github.com/microsoft/vscode-js-debug#readme) |
| C/C++ | CodeLLDB | `codelldb` | Best fit on Apple Silicon: current native arm64 artifact, LLDB foundation, C++ visualizers, watchpoints, launch/attach, and remote support. [CodeLLDB](https://github.com/vadimcn/codelldb#readme) |
| Java/Spring Boot | Microsoft Java Debug | `java-debug-adapter` | Load the debug bundle into jdtls; `nvim-jdtls` then registers Java DAP and discovers main classes. Spring Boot needs no separate adapter; launch the discovered application main class or use project launch config. Use Maven/Gradle tasks for tests until the released Java Test bundle supports JDTLS 1.60's ASM version. [nvim-jdtls debugger setup](https://github.com/mfussenegger/nvim-jdtls#debugger-via-nvim-dap), [Java Debug](https://github.com/microsoft/java-debug#readme) |
| Scala | Metals' built-in DAP | none | Call `require("metals").setup_dap()`; do not install another adapter. Metals supplies JVM main/test/attach sessions. [Metals DAP](https://scalameta.org/metals/docs/integrations/debug-adapter-protocol/) |
| Kotlin/JVM | community Kotlin Debug Adapter | `kotlin-debug-adapter` | Provisional. It requires a compiled Maven/Gradle project plus main-class/project-root information and is less mature than the Python/Go/Java adapters. Prefer direct nvim-dap configuration over another thin plugin. [Kotlin Debug Adapter](https://github.com/fwcd/kotlin-debug-adapter#readme) |

Do not add default DAP configurations for Bash, Terraform/HCL, SQL, Markdown,
HTML/CSS, JSON, YAML, or TOML. Shell stepping depends on an old bashdb-based
adapter and Homebrew Bash 4+, while validation/task output is more useful for
the actual workflows. Terraform is declarative; `validate`, `plan`, tests, and
`TF_LOG` are its debugging workflow. Data and markup languages have no runtime
to step through.

## Gaps found in the pre-implementation audit

The audit covered `nvim/lua/plugins/lsp.lua`, `formatting.lua`, `treesitter.lua`,
`workflow.lua`, `config/runner.lua`, `bootstrap.sh`, and the Brewfile.
Items 1-6 below are now addressed. Items 7-10 remain deliberate project-owned
or low-noise boundaries rather than missing global tooling.

1. Terraform/HCL has no LSP entries, Mason tools, Treesitter parsers, formatter,
   linter, runner/task behavior, or system Terraform CLI.
2. Kotlin has no LSP, formatter/linter, Treesitter parser, runner, or DAP.
3. No shared DAP client or UI is configured. Java debug bundles are not loaded,
   Metals DAP is not enabled, and none of the external adapters is declared.
4. JSON/YAML servers lack SchemaStore catalogs, reducing completion and
   validation quality for common configuration files.
5. Metals is pinned to 1.6.7 in both Neovim and bootstrap while 1.6.8 is the
   current stable release.
6. TOML is served by Taplo but has no explicit Conform mapping or configured
   autoformat boundary.
7. Markdown has no style linter. This is not necessarily a defect: enable
   markdownlint-cli2 only in projects that declare its configuration to avoid
   noisy personal rules.
8. CSS has semantic assistance but no Stylelint integration. Add it only for
   repositories that declare Stylelint.
9. SQL has no LSP, but this is currently a reasonable stability/privacy choice.
   Dadbod completion plus dialect-configured SQLFluff covers the requested
   SQLite/PostgreSQL workflow without committing connection credentials.
10. ShellCheck exists in Homebrew rather than the Mason tool list. BashLS will
    use that executable automatically, so adding a duplicate Mason copy is not
    required.

## Applied implementation boundary

The default installation now adds:

- Terraform: `terraform-ls`, `tflint`, Terraform and HCL Treesitter parsers, and
  conditional `terraform fmt`/TFLint integration. Install Terraform CLI for the
  shell as well as Neovim.
- Kotlin: `kotlin-lsp`, `ktlint`, `detekt`, Kotlin Treesitter, conditional ktlint
  formatting/linting, and Gradle/Maven/current-file runner discovery.
- DAP: `debugpy`, `delve`, `js-debug-adapter`, `codelldb`,
  `java-debug-adapter`, and `kotlin-debug-adapter`, with Scala owned
  by Metals.
- JSON/YAML: SchemaStore.nvim catalogs.
- Metals 1.6.8.

Install but activate project-sensitive linters only when their project markers
exist. Keep Checkstyle, SpotBugs, Error Prone, Detekt build integration,
golangci-lint, Stylelint, markdownlint, SQL dialect selection, and provider
security policy in each repository. This preserves immediate error feedback
without turning a shared dotfiles repository into a source of surprise policy.

## Mason and system boundaries

[Mason's requirements](https://github.com/mason-org/mason.nvim#requirements)
include Git, download/archive utilities, and external providers where packages
use npm, PyPI, or Go sources. The bootstrap already supplies Node, Python, Go,
Java, Git, curl, and archive tools.

Mason should own editor servers, linters, formatters, and adapters. Project
runtimes and build systems must still exist outside Neovim:

- Terraform CLI is needed by terraform-ls and by shell/project tasks.
- Python project virtual environments remain project-local; Mason's debugpy
  environment only runs the adapter.
- Node/npm remains necessary for JavaScript language tools and debug targets.
- Java 21 launches jdtls while the machine profile selects Java 17 or 21 for
  projects.
- Coursier continues to own Scala CLI and Metals because Mason has no packages
  for them.
- Gradle/Maven project wrappers remain authoritative for Java and Kotlin builds.
