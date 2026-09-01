#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
timestamp="$(date +%Y%m%d-%H%M%S)"
machine_config="${XDG_CONFIG_HOME:-$HOME/.config}/dotdotdot/machine.zsh"
machine_brewfile="${XDG_CONFIG_HOME:-$HOME/.config}/dotdotdot/Brewfile.local"
backup_root=""
brew_bin=""
dry_run=0
install_tools=0
check_only=0
check_failures=0

usage() {
  cat <<'EOF'
Usage: ./bootstrap.sh [--dry-run] [--install] [--check]

Links this repository into $HOME and backs up conflicting paths under:
  ~/.dotfiles-backups/<timestamp>/

Options:
  --dry-run   Show actions without changing the machine
  --install   Install Homebrew when needed, then all declared apps and tools
  --check     Read-only report for dependencies, links, Java, and submodules
  -h, --help  Show this help message

Examples:
  ./bootstrap.sh --dry-run --install
  ./bootstrap.sh --install
  ./bootstrap.sh --check

Machine preferences are read from ~/.config/dotdotdot/machine.zsh.
Copy zsh/machine.example.zsh there to override the default Java version or PATH.
The optional ~/.config/dotdotdot/Brewfile.local can declare machine-only packages.
Neither local file is created, linked, or overwritten by bootstrap.
The shared theme (dark or light Catppuccin) is set once in theme.conf and
applied to WezTerm, tmux, and Neovim; switch at runtime with `theme light|dark`.
EOF
}

log() {
  printf '%s\n' "$*"
}

die() {
  log "Error: $*" >&2
  exit 1
}

run() {
  if ((dry_run)); then
    {
      printf '[dry-run]'
      printf ' %q' "$@"
      printf '\n'
    } >&2
    return 0
  fi

  "$@"
}

require_supported_system() {
  [[ "$(uname -s)" == "Darwin" ]] || die "bootstrap currently supports macOS only."
  [[ "$(uname -m)" == "arm64" ]] || die "bootstrap currently supports Apple Silicon Macs only."
}

ensure_command_line_tools() {
  if /usr/bin/xcode-select -p >/dev/null 2>&1; then
    return
  fi

  if ((dry_run)); then
    log "[dry-run] request installation of Apple's Command Line Tools"
    return
  fi

  /usr/bin/xcode-select --install >/dev/null 2>&1 || true
  die "Command Line Tools installation was requested. Complete it, then rerun bootstrap."
}

find_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    command -v brew
  elif [[ -x /opt/homebrew/bin/brew ]]; then
    printf '%s\n' /opt/homebrew/bin/brew
  else
    return 1
  fi
}

install_homebrew() {
  local installer
  local installer_url="https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh"

  if ((dry_run)); then
    log "[dry-run] install Homebrew from $installer_url"
    brew_bin=/opt/homebrew/bin/brew
    export HOMEBREW_PREFIX=/opt/homebrew
    export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
    return
  fi

  installer="$(mktemp -t dotdotdot-homebrew)"
  /usr/bin/curl --fail --silent --show-error --location "$installer_url" --output "$installer"
  /bin/bash "$installer"
  rm -f "$installer"

  [[ -x /opt/homebrew/bin/brew ]] || die "Homebrew installation completed without /opt/homebrew/bin/brew."
}

configure_homebrew() {
  if brew_bin="$(find_homebrew)"; then
    :
  elif ((install_tools)); then
    install_homebrew
  else
    return 1
  fi

  if ((dry_run)) && [[ ! -x "$brew_bin" ]]; then
    return
  fi

  eval "$("$brew_bin" shellenv)"
}

install_brew_bundles() {
  run "$brew_bin" tap hashicorp/tap
  run "$brew_bin" trust --formula hashicorp/tap/terraform
  run env HOMEBREW_NO_AUTO_UPDATE=1 "$brew_bin" bundle --no-upgrade --file "$repo_root/Brewfile"
  if [[ -r "$machine_brewfile" ]]; then
    run env HOMEBREW_NO_AUTO_UPDATE=1 "$brew_bin" bundle --no-upgrade --file "$machine_brewfile"
  fi

  if [[ -n "${HOMEBREW_PREFIX:-}" && -O "$HOMEBREW_PREFIX/share" ]]; then
    run chmod g-w "$HOMEBREW_PREFIX/share"
  fi
}

sync_submodules() {
  command -v git >/dev/null 2>&1 || die "Git is required to initialize tmux plugins."
  run git -C "$repo_root" submodule init
  run git -C "$repo_root" submodule sync --recursive
  run git -C "$repo_root" submodule update --init --recursive
}

ensure_backup_root() {
  if [[ -n "$backup_root" ]]; then
    return
  fi

  backup_root="${HOME}/.dotfiles-backups/${timestamp}"
  run mkdir -p "$backup_root"
}

backup_destination() {
  local target="$1"
  local relative_path
  local destination

  ensure_backup_root

  if [[ "$target" == "$HOME"/* ]]; then
    relative_path="${target#"$HOME"/}"
  else
    relative_path="$(basename "$target")"
  fi

  destination="${backup_root}/${relative_path}"
  while [[ -e "$destination" || -L "$destination" ]]; do
    destination="${destination}.bak"
  done

  printf '%s\n' "$destination"
}

same_target() {
  local source="$1"
  local target="$2"

  [[ -e "$target" && "$target" -ef "$source" ]]
}

backup_item() {
  local target="$1"
  local destination

  ensure_backup_root
  destination="$(backup_destination "$target")"
  run mkdir -p "$(dirname "$destination")"
  run mv "$target" "$destination"
  log "Backed up: $target -> $destination"
}

link_item() {
  local source="$1"
  local target="$2"

  if [[ ! -e "$source" && ! -L "$source" ]]; then
    log "Skipping missing source: $source"
    return
  fi

  run mkdir -p "$(dirname "$target")"

  if same_target "$source" "$target"; then
    log "Already linked: $target -> $source"
    return
  fi

  if [[ -e "$target" || -L "$target" ]]; then
    backup_item "$target"
  fi

  run ln -s "$source" "$target"

  if ((!dry_run)) && ! same_target "$source" "$target"; then
    die "Failed to link $target -> $source"
  fi

  log "Linked: $target -> $source"
}

link_dotfiles() {
  link_item "$repo_root/nvim" "$HOME/.config/nvim"
  link_item "$repo_root/wezterm" "$HOME/.config/wezterm"
  link_item "$repo_root/aerospace" "$HOME/.config/aerospace"
  link_item "$repo_root/.tmux.conf" "$HOME/.tmux.conf"
  link_item "$repo_root/.tmux" "$HOME/.tmux"
  link_item "$repo_root/.zprofile" "$HOME/.zprofile"
  link_item "$repo_root/.zshrc" "$HOME/.zshrc"
  link_item "$repo_root/.p10k.zsh" "$HOME/.p10k.zsh"
  # Single theme source of truth, read by WezTerm, tmux, and Neovim.
  link_item "$repo_root/theme.conf" "$HOME/.config/dotfiles-theme"
}

resolve_java_version() {
  local version=""
  if [[ -r "$machine_config" ]]; then
    version="$(/bin/zsh -dfc 'source "$1" >/dev/null 2>&1; print -r -- "${DOTDOTDOT_JAVA_VERSION:-${JAVA_HOME##*openjdk@}}"' dotdotdot "$machine_config")"
  fi
  version="${version%%/*}"
  if [[ ! "$version" =~ ^[0-9]+$ ]]; then
    # No machine preference: default to the newest Homebrew OpenJDK present.
    local dir candidate release newest=0
    for dir in "${HOMEBREW_PREFIX:-/opt/homebrew}"/opt/openjdk@*/ "${HOMEBREW_PREFIX:-/opt/homebrew}"/opt/openjdk/; do
      [[ -d "$dir/libexec/openjdk.jdk/Contents/Home" ]] || continue
      candidate="${dir%/}"
      candidate="${candidate##*openjdk@}"
      if [[ ! "$candidate" =~ ^[0-9]+$ ]]; then
        release="$dir/libexec/openjdk.jdk/Contents/Home/release"
        [[ -r "$release" ]] && candidate="$(sed -n 's/^JAVA_VERSION="\([0-9]*\).*/\1/p' "$release" | head -1)"
      fi
      if [[ "$candidate" =~ ^[0-9]+$ ]] && ((candidate > newest)); then
        newest="$candidate"
      fi
    done
    ((newest > 0)) && version="$newest"
  fi
  [[ "$version" =~ ^[0-9]+$ ]] || version="17"
  printf '%s\n' "$version"
}

configure_runtime_environment() {
  local java_version
  java_version="$(resolve_java_version)"
  export JAVA_HOME="$HOMEBREW_PREFIX/opt/openjdk@${java_version}/libexec/openjdk.jdk/Contents/Home"
  export PATH="$JAVA_HOME/bin:$HOME/Library/Application Support/Coursier/bin:$HOME/.local/share/nvim/mason/bin:$HOMEBREW_PREFIX/opt/libpq/bin:$PATH"
  [[ -x "$JAVA_HOME/bin/java" ]] || die "The selected Java $java_version runtime is missing at $JAVA_HOME."
}

install_runtime_tools() {
  local metals_dir="${XDG_CACHE_HOME:-$HOME/.cache}/nvim/nvim-metals"
  local metals_version="1.6.8"
  local metals_version_file="$metals_dir/.version"

  run fnm install --lts
  run fnm default lts-latest
  if ((!dry_run)); then
    eval "$(fnm env --shell bash)"
  fi
  run fnm use default
  if ! command -v scala-cli >/dev/null 2>&1; then
    run coursier install scala-cli:1.11.0
  fi
  if [[ ! -x "$metals_dir/metals" || ! -r "$metals_version_file" || "$(<"$metals_version_file")" != "$metals_version" ]]; then
    run mkdir -p "$metals_dir"
    run coursier bootstrap --java-opt -Xss4m --java-opt -Xms100m "org.scalameta:metals_2.13:${metals_version}" -o "$metals_dir/metals" -f
    if ((dry_run)); then
      log "[dry-run] record Metals $metals_version in $metals_version_file"
    else
      printf '%s\n' "$metals_version" > "$metals_version_file"
    fi
  fi

  run fnm exec --using=default nvim --headless "+Lazy! restore" +qa
  run fnm exec --using=default nvim --headless "+lua print('Neovim startup OK')" "+lua if vim.v.errmsg ~= '' then vim.cmd('cquit') end" +qa
  run fnm exec --using=default nvim --headless "+MasonToolsInstallSync" "+lua if vim.v.errmsg ~= '' then vim.cmd('cquit') end" +qa
  run fnm exec --using=default nvim --headless "+TSInstallConfigured" "+lua if vim.v.errmsg ~= '' then vim.cmd('cquit') end" +qa
}

check_ok() {
  log "OK: $*"
}

check_bad() {
  log "MISSING: $*"
  check_failures=$((check_failures + 1))
}

check_command() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    check_ok "$name"
  else
    check_bad "$name"
  fi
}

check_file() {
  local label="$1"
  local path="$2"
  if [[ -e "$path" ]]; then
    check_ok "$label ($path)"
  else
    check_bad "$label ($path)"
  fi
}

check_link() {
  local source="$1"
  local target="$2"
  if same_target "$source" "$target"; then
    check_ok "$target -> $source"
  else
    check_bad "$target is not linked to $source"
  fi
}

check_submodules() {
  local status
  if ! status="$(git -C "$repo_root" submodule status --recursive 2>/dev/null)"; then
    check_bad "tmux submodule metadata"
    return
  fi
  if printf '%s\n' "$status" | grep -Eq '^[-+]'; then
    check_bad "tmux submodules are uninitialized or not at their pinned revisions"
  else
    check_ok "tmux submodules"
  fi
}

check_java() {
  local java_version
  local java_home
  java_version="$(resolve_java_version)"
  java_home="${HOMEBREW_PREFIX:-/opt/homebrew}/opt/openjdk@${java_version}/libexec/openjdk.jdk/Contents/Home"
  if [[ -x "$java_home/bin/java" ]]; then
    check_ok "Java $java_version default ($java_home)"
  else
    check_bad "Java $java_version default ($java_home)"
  fi
}

check_metals() {
  local metals_dir="${XDG_CACHE_HOME:-$HOME/.cache}/nvim/nvim-metals"
  local expected_version="1.6.8"
  if [[ -x "$metals_dir/metals" && -r "$metals_dir/.version" && "$(<"$metals_dir/.version")" == "$expected_version" ]]; then
    check_ok "Metals $expected_version"
  else
    check_bad "Metals $expected_version ($metals_dir/metals)"
  fi
}

check_installation() {
  local command_name

  require_supported_system
  if ! configure_homebrew; then
    check_bad "Homebrew"
  else
    check_ok "Homebrew ($HOMEBREW_PREFIX)"
  fi

  # Mirror the login-shell PATH that zsh/env.zsh builds, so command checks
  # reflect what an actual shell on this machine sees (e.g. coursier-installed
  # tools like scala-cli, mason adapters).
  local _dotdotdot_path_entry
  for _dotdotdot_path_entry in \
    "$HOME/.local/bin" \
    "$HOME/go/bin" \
    "$HOME/Library/Application Support/Coursier/bin" \
    "$HOME/.local/share/nvim/mason/bin"; do
    [[ -d "$_dotdotdot_path_entry" ]] && PATH="$_dotdotdot_path_entry:$PATH"
  done
  export PATH

  for command_name in aerospace brew clang cmake codelldb coursier debugpy-adapter detekt direnv dlv fd fnm fzf git go intellij-server java js-debug-adapter kotlin kotlin-debug-adapter kotlinc ktlint lazygit lua make mvn node npm nvim psql python3 rg scala-cli shellcheck sqlite3 terraform terraform-ls tflint tmux wezterm zoxide zsh; do
    check_command "$command_name"
  done

  check_link "$repo_root/nvim" "$HOME/.config/nvim"
  check_link "$repo_root/wezterm" "$HOME/.config/wezterm"
  check_link "$repo_root/aerospace" "$HOME/.config/aerospace"
  check_link "$repo_root/.tmux.conf" "$HOME/.tmux.conf"
  check_link "$repo_root/.tmux" "$HOME/.tmux"
  check_link "$repo_root/.zprofile" "$HOME/.zprofile"
  check_link "$repo_root/.zshrc" "$HOME/.zshrc"
  check_link "$repo_root/.p10k.zsh" "$HOME/.p10k.zsh"
  check_link "$repo_root/theme.conf" "$HOME/.config/dotfiles-theme"

  check_submodules
  check_java
  check_metals
  check_file "Java debug adapter bundle" "${XDG_DATA_HOME:-$HOME/.local/share}/nvim/mason/share/java-debug-adapter/com.microsoft.java.debug.plugin.jar"

  if [[ -n "$brew_bin" ]] && ! env HOMEBREW_NO_AUTO_UPDATE=1 "$brew_bin" bundle check --no-upgrade --file "$repo_root/Brewfile"; then
    check_bad "shared Brewfile dependencies"
  elif [[ -n "$brew_bin" ]]; then
    check_ok "shared Brewfile dependencies"
  fi
  if [[ -r "$machine_brewfile" && -n "$brew_bin" ]]; then
    if env HOMEBREW_NO_AUTO_UPDATE=1 "$brew_bin" bundle check --no-upgrade --file "$machine_brewfile"; then
      check_ok "machine-local Brewfile dependencies"
    else
      check_bad "machine-local Brewfile dependencies"
    fi
  fi

  if [[ -r "$machine_config" ]]; then
    check_ok "machine profile ($machine_config)"
  else
    log "INFO: no machine profile; shared defaults are active (copy zsh/machine.example.zsh to customize)"
  fi

  if ((check_failures > 0)); then
    die "$check_failures installation check(s) failed."
  fi
  log "All installation checks passed."
}

main() {
  while (($# > 0)); do
    case "$1" in
      --dry-run)
        dry_run=1
        ;;
      --install)
        install_tools=1
        ;;
      --check)
        check_only=1
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        usage
        die "Unknown argument: $1"
        ;;
    esac
    shift
  done

  if ((check_only)) && ((dry_run || install_tools)); then
    die "--check cannot be combined with --dry-run or --install."
  fi

  require_supported_system

  if ((check_only)); then
    check_installation
    exit 0
  fi

  if ((install_tools)); then
    ensure_command_line_tools
    configure_homebrew
    install_brew_bundles
  fi

  sync_submodules
  link_dotfiles

  if ((install_tools)); then
    configure_runtime_environment
    install_runtime_tools
    if ((!dry_run)); then
      check_installation
    fi
  fi

  if [[ -n "$backup_root" ]]; then
    log "Backups stored in: $backup_root"
  fi
  if [[ ! -r "$machine_config" ]]; then
    log "No machine profile; Java follows the newest Homebrew OpenJDK installed. Copy zsh/machine.example.zsh to $machine_config to customize this Mac."
  fi

  log "Bootstrap complete. Run ./bootstrap.sh --check to verify the machine."
}

main "$@"
