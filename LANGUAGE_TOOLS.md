# Language tools on first use

Opening a supported filetype starts background installation of its missing LSP,
formatter, and linter packages. A newly installed LSP attaches to matching open
buffers in the same Neovim session. Existing executables are reused; installed
packages are not upgraded automatically. Concurrent requests share an install.
Failures produce a notification and wait for an explicit retry.

- `:ToolingInfo`: detected filetype, configured/attached servers, missing packages.
- `:ToolingInstall`: retry tools and syntax parsers for the current filetype.
- `:Mason` / `:MasonLog`: package installation status / failure details.
- `:LspInfo` and `:ConformInfo`: attachment and formatter diagnostics.
- `Space c f`: format the current buffer explicitly.

The configured languages cover Python, Go, JavaScript/TypeScript and React,
HTML/CSS, JSON/YAML/TOML, Markdown, shell, Lua, C/C++/Objective-C/CUDA, Java,
Kotlin, Scala, SQL, and Terraform. This is a curated selection, not a promise to
choose a server automatically for every possible extension. Add an LSP to
`plugins/lsp.lua` and its formatter/linter profile to `config/tools.lua` when
adding another language. The existing bulk `MasonToolsInstall` command remains
available during bootstrap.

Syntax parsers also install on first use for configured languages. CUDA uses the
C++ parser; React, shell, JSONC, and other aliases use Neovim's parser-language
mapping. Parser generation uses the machine's tree-sitter CLI or installs it
through Mason. A native compiler is still required for building parsers.

Java starts jdtls after its first installation completes. Scala uses the existing
Metals 1.6.8 Coursier bootstrap and cache location, then attaches to the open
file. Required machine runtimes (Java, Node, Python, Go, Coursier, compiler/SDK,
Terraform, etc.) remain the responsibility of bootstrap or the project's own
environment. A failed package install reports the problem rather than hiding it.

Installing a formatter/linter does **not** enable unconditional formatting or
linting. Project configuration continues to control formatting on save and
config-dependent linters. CUDA follows the C/C++ rule: `.clang-format` or
`_clang-format` opts into formatting on save. Explicit formatting uses
clang-format; clangd supplies diagnostics and clang-tidy integration.

## CUDA project requirements

`.cu` and `.cuh` are detected as `cuda`; clangd receives the `cuda-cpp` language
ID. The editor provides clangd, clang-format, and C++ syntax highlighting.

Useful CUDA diagnostics additionally require the real compiler flags and toolkit
headers. Provide the project's `compile_commands.json` (including its include
paths and CUDA target) in a location clangd can discover. If necessary, a
project-local `.clangd` can specify the toolkit path and architecture. Do not
copy Linux build-machine paths into a local macOS configuration unless those
paths are actually available there. Running the editor on the configured remote
build machine is another option.

Installing clangd cannot supply the CUDA toolkit or reconstruct a project's
build configuration. We do not globally suppress missing-toolkit errors, invent
an architecture, or replace project compiler flags. See the upstream [CUDA
FAQ](https://clangd.llvm.org/faq) and [compile-command
configuration](https://clangd.llvm.org/config).

## Buffer closing and Which-key

In normal mode press **Space, b, d** to close the current buffer, with native
confirmation for unsaved changes. Press **Space, b** and pause to see **Close
Current Buffer** in Which-key. `Space w x` closes an editor window/view instead.

Neo-tree leaves Space available to the shared leader menu. Enter still opens
files and toggles folders. Buffer-closing and selection commands invoked from
Neo-tree target an editing window and preserve the tree.

## Verification

- `./scripts/check`: deterministic installation-event tests cover duplicate
  requests, existing tools, installs initiated elsewhere, failures, manual retry,
  and enabling a server independently of a formatter failure.
- `python3 tests/navigation.py`: real PTY → tmux → Neovim tests include the
  visible Which-key buffer menu in Neo-tree.
- `python3 tests/first_use.py`: optional network acceptance. Uses installed
  plugins but fresh temporary Mason/parser storage. Opens Lua, waits for actual
  installation, checks LSP hover and formatting, then opens CUDA and checks
  clangd hover, formatting, and parser attachment. CUDA's fixture deliberately
  needs no SDK; this test does not establish a real GPU project's configuration.

On 2026-09-10, the fresh first-use Lua/CUDA test passed without reopening either
file. The earlier pane-navigation terminal test passed all 50 checks, including
Which-key in Neo-tree; current buffer/task acceptance is recorded in README.md.
A separate temporary-cache check verified the pinned Metals bootstrap.
