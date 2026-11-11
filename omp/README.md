# Oh My Pi integration

## Local work manager

The opt-in extension runs an accepted job plan through owned Git worktrees,
actual checks, separate Spec and Technical/Standards review, bounded repair, and
related-ticket integration. Independent jobs keep separate target branches.
[Roles and capabilities](roles-and-capabilities.md) defines the responsibilities;
the [design research](../docs/omp-agentic-workflow-research.md) records the accepted
constraints. A worker's completion message alone never establishes readiness.

Install from a stable checkout of this repository:

```sh
./bootstrap.sh --dry-run --omp-workflow
./bootstrap.sh --omp-workflow
```

This adds one extension file symlink, `extensions/dotdotdot-work.ts`, to the
selected OMP agent directory. Its imports resolve through the real repository;
keep that checkout available. Conflicting entrypoint files are backed up with
bootstrap's normal backup policy; repeating setup leaves the link alone. Other
extensions, authentication, model settings, sessions and profiles are preserved.
Normal bootstrap appearance setup retains its existing default-profile behavior.
Without `--omp-workflow`, the manager is optional and its absence does not fail
`bootstrap.sh --check`; add that flag to require OMP and its entrypoint link during checks.
No global settings overlay, service, model roster, or skill checkout is installed.

Manager adoption honors `OMP_PROFILE` (legacy `PI_PROFILE` is the fallback).
For a named profile it links into
`$HOME/${PI_CONFIG_DIR:-.omp}/profiles/<profile>/agent/extensions`; named profiles
ignore `PI_CODING_AGENT_DIR`, as OMP does. In default mode an absolute
`PI_CODING_AGENT_DIR` overrides `$HOME/${PI_CONFIG_DIR:-.omp}/agent`.
`PI_CONFIG_DIR` is a relative directory under HOME. Setup rejects unsafe profile
names and config paths. For example:

```sh
OMP_PROFILE=work ./bootstrap.sh --omp-workflow
```

Reload or restart that OMP session, then use `/work`. Factory registration does
not start a manager, create queue state, fetch skills, or request a model. Runtime
state is bound to OMP's actual exported `getAgentDir()`, under its `work` folder.
The first queue command/tool opens its local manager state.

Before starting jobs, use `/work skills status` and explicitly run
`/work skills sync`. Sync clones or fast-forwards the public
[Matt Pocock skills source](https://github.com/mattpocock/skills) on its current
default branch. Repeat the same explicit command to update; there is no fixed
release tag. Dirty, detached, diverged or redirected sources are preserved and
reported for inspection. A missing source blocks work with setup guidance.
Every independent job or related-ticket campaign captures committed skill bodies
and companion files at first work; repairs, checks and reviews reuse those exact
recorded inputs. Later jobs see updates. The adapter translates upstream Skill
tool instructions into reads of those local snapshot paths.

Describe and approve actionable scope, acceptance criteria, dependencies and
validation in the manager conversation. The manager-facing tools are:

| Tool | Purpose |
| --- | --- |
| `work_submit` | Queue a `jobs` array from the accepted plan and start background follow-through. |
| `work_status` | Inspect queue state, target branch, candidate and blocker. |
| `work_control` | Pause, reconcile/resume, or safely clean an owned workspace. |
| `work_skills` | Inspect or explicitly sync skill source. |

Each submitted job has `task`, `repo`, `branch`, nonempty `acceptance` and
`checks` (`name` and shell `command`), plus optional `id`, `kind`, `base`,
`dependsOn`, and `integrationTarget`. Tasks must carry self-contained accepted
spec/ticket context or accessible local pointers. IDs identify dependencies.
For a related feature, create an `integration` parent depending on all children;
children name that parent as `integrationTarget` and depend only on real child
prerequisites. Unrelated jobs omit `integrationTarget`. Tools cannot set runtime
state, choose models, or inject passing evidence. Check commands and worker code
execute locally with the user's normal OMP permissions; this is not an execution
sandbox.

Useful user commands:

```text
/work status
/work pause
/work resume
/work resume <job-id>
/work cleanup <job-id>
/work skills status
/work skills sync
/work roles
/work role set implementer <available-model-selector>
/work role clear implementer
```

Roles inherit the live parent model and thinking setting. Only explicit user
commands save local identity selectors, resolved against the live OMP model
catalog at dispatch. Examples of runtime roles are `implementer`, `spec-reviewer`
and `technical-reviewer`. A stale or unavailable choice blocks visibly; clear or
replace it without editing shared dotfiles. No automatic model selection occurs.
Role selectors change identity; thinking continues to inherit the live parent
setting. Choose and assess a model with the [role guide](roles-and-capabilities.md).

Optional machine-local `work/config.json` accepts only:

```json
{"maxWorkers": 2, "repairLimit": 2, "skillsDir": "/absolute/path/to/current-skills"}
```

Omit it for two shared worker slots and two repair cycles. `maxWorkers` must be
a positive safe integer; `repairLimit` a nonnegative safe integer. These limits
apply across this profile's managed jobs and roles. Change configuration before
opening the manager, or restart the session to apply new limits. `skillsDir` and
the trusted launch variable `DOTDOTDOT_WORK_SKILLS_DIR` point to a clean local
skills checkout; the environment variable takes precedence. They are not model
tool parameters. Role choices live separately in `work/role-choices.json`.

Only terminal job changes notify the parent, triggering its follow-through with
the local branch, candidate, evidence path or precise blocker. Inspect the
`work/results`, `work/evidence`, `work/sessions` and skill snapshots
when diagnosing outcomes. Receipts are associated with the exact candidate and
accepted plan; later edits require fresh evidence. Readiness is local checked and
reviewed completion, not remote publication or proof of freedom from all defects.
The manager does not publish artifacts or push Git branches. Model sessions use
the locally configured provider route.

Pause stops new dispatch while active workers can finish. Shutdown aborts owned
worker processes and retains interrupted state. Reopen the same OMP profile and
use explicit resume to reconcile recorded ownership, Git state and surviving work
before retrying. Dirty or unknown work is retained and blocks automatic reuse;
inspect the reported blocker and worktree. Cleanup removes only safely owned
completed workspaces and keeps evidence. This first delivery runs while its OMP
session is alive; there is no unattended restart service or cross-laptop queue.
Managed worker processes set `DOTDOTDOT_WORK_CHILD=1` to suppress nested manager
registration while preserving the user's other extensions. Their default-profile
override is explicitly bound to the parent's actual agent directory, including a
named profile chosen with `--profile`; this retains the physical parent settings,
authentication, models and session root instead of falling back to default-profile
credentials. Other inherited environment settings remain available.

Development checks use Bun with no production package dependencies:

```sh
cd omp
bun install --frozen-lockfile
bun run typecheck
bun test workflow
cd ..
python3 -m unittest discover -s tests -p 'test_omp_workflow_setup.py' -v
./scripts/check
```

The controlled fixtures use disposable Git repositories and host/process
boundaries. The real-binary RPC fixtures under `workflow/fixtures` use isolated
homes and a loopback-only provider; they need installed `omp`, Bun, and permission
to bind loopback. They do not use work credentials or external model APIs.
Behavior and model judgment still need a permitted local acceptance run on each
work laptop; do not transfer proprietary artifacts here.

## Images in tmux

`zsh/omp.zsh` selects `PI_FORCE_IMAGE_PROTOCOL=sixel` for an `omp` launch when
the attached client identifies as WezTerm, advertises SIXEL, and the tmux server
reports `sixel_support=1`. The choice applies only to that child process. Explicit
`PI_FORCE_IMAGE_PROTOCOL` values win; other terminals and direct launches keep
OMP's own detection. The adapter queries the current pane's attached client each
time rather than trusting an inherited `WEZTERM_PANE` marker.

OMP 18.4.1 otherwise selects cursor-based Kitty graphics for WezTerm. Its tmux
passthrough bypasses tmux's image grid, so pane scrolling/reflow can leave image
fragments or paint over the status bar. SIXEL gives tmux ownership of image
storage, clipping and redraw. Global passthrough stays enabled for other uses;
enabling it alone does not solve image positioning.

Existing shells need `source ~/.zshrc`, then OMP must be relaunched (save/exit and
resume the session as usual). `command omp` bypasses the shell adapter.
Already-running processes retain their launch environment. Keep
`terminal.showImages: true` in OMP's settings. Do not force Kitty placeholders
or change `TERM` to impersonate the outer terminal inside tmux.

Run `python3 tests/terminal_images.py` for the installed OMP/private-tmux replay.
It checks image redraw, window switching, copy-mode scrolling, split-pane reflow,
image pixel content, and bounds relative to the pane/status bar. Add `--stream`
to drive 60 streamed text blocks through OMP using a loopback-only fixture server.
Repeat with `--stream --tall` for a source image taller than the viewport.
It uses temporary state and a synthetic image without provider credentials or
external model calls. The terminal's identity reply is simulated;
native WezTerm pixel appearance remains a separate
visual check. See [diagnosis and acceptance](../docs/omp-terminal-images.md).

## Theme

`dotdotdot-rose-pine-main.json` and `dotdotdot-rose-pine-dawn.json` adapt Oh My Pi 18.4.1's bundled
[dark-rose-pine theme](https://github.com/can1357/oh-my-pi/blob/v18.4.1/packages/tui/src/theme/defaults/dark-rose-pine.json)
to the shared [Rosé Pine main and Dawn palettes](https://rosepinetheme.com/palette/).
They define every required token in that version's
[theme schema](https://github.com/can1357/oh-my-pi/blob/v18.4.1/packages/tui/src/theme/theme-schema.json).
The role values must match `theme/palette.tsv`; `tests/test_palette.py` checks
all variables and every color/export reference so these packaged assets cannot
drift silently. Text and tool output use the palette's text color; secondary text uses subtle for
readability on the light surfaces. Error panels use the overlay surface with
Love accents rather than retaining the dark theme's hardcoded background.

Bootstrap links both themes into `${PI_CODING_AGENT_DIR:-~/.omp/agent}/themes`
and selects both appearance slots through OMP's native CLI when `omp` is installed.
It preserves unrelated settings, credentials, extensions, and sessions.
`bootstrap.sh --check` checks both links and selected slots. The equivalent commands are:

```sh
omp config set theme.light dotdotdot-rose-pine-dawn
omp config set theme.dark dotdotdot-rose-pine-main
```

Named OMP profiles have separate settings and theme directories. To use these
themes there, link both JSON files into that profile's `agent/themes` directory and
run the same commands with `OMP_PROFILE=<name>`. Dotfiles configure the default
profile only (or an explicit `PI_CODING_AGENT_DIR`); an inherited `OMP_PROFILE`
does not redirect bootstrap into another profile. The separate `pi` app is untouched.

OMP follows OSC 11 background replies, with `COLORFGBG` as its fallback. The
shared `theme auto|light|dark` command and startup config export matching values.
In auto mode, WezTerm follows macOS and OMP's native appearance observer
rechecks the terminal background to select the configured light/dark slot.
Tmux uses shared window defaults and resets retained OSC foreground/background/
cursor colors in every pane, so stale client caches or application overrides
cannot keep OSC 11 queries on the previous palette. This also covers hidden
windows and applications using the alternate screen; it does not send input to them.
Already-running OMP sessions can change their light/dark theme slots through
`/settings`; fresh sessions read the persisted settings.

Run `python3 tests/terminal_colors.py` for real tmux color queries with a simulated
outer terminal. It covers manual and automatic transitions, retained application
colors, full-screen exit, hidden panes, and defaults in newly created windows.
Run `python3 tests/omp_themes.py` to render both themes with installed OMP in
disposable offline sessions. These checks do not change macOS appearance.

Upstream Oh My Pi theme source: MIT license. See LICENSE for the full upstream
copyright and permission notice.
