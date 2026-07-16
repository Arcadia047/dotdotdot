#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_root=""
dry_run=0

usage() {
  cat <<'EOF'
Usage: ./bootstrap.sh [--dry-run] [--install]

Links dotfiles from this repo into $HOME, backing up any conflicting paths into:
  ~/.dotfiles-backups/<timestamp>/

Options:
  --dry-run   Show what would happen without modifying anything
  --install   Install the curated Homebrew bundle and editor/runtime tools
  -h, --help  Show this help message
EOF
}

log() {
  printf '%s\n' "$*"
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
    log "Failed to link: $target -> $source"
    exit 1
  fi

  log "Linked: $target -> $source"
}

main() {
  local install_tools=0
  local metals_dir="${XDG_CACHE_HOME:-$HOME/.cache}/nvim/nvim-metals"

  while (($# > 0)); do
    case "$1" in
      --dry-run)
        dry_run=1
        ;;
      --install)
        install_tools=1
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        log "Unknown argument: $1"
        usage
        exit 1
        ;;
    esac
    shift
  done

  if [[ -f "$repo_root/.gitmodules" ]]; then
    run git -C "$repo_root" submodule update --init --recursive
  fi

  link_item "$repo_root/nvim" "$HOME/.config/nvim"
  link_item "$repo_root/wezterm" "$HOME/.config/wezterm"
  link_item "$repo_root/aerospace" "$HOME/.config/aerospace"
  link_item "$repo_root/.tmux.conf" "$HOME/.tmux.conf"
  link_item "$repo_root/.tmux" "$HOME/.tmux"
  link_item "$repo_root/.zprofile" "$HOME/.zprofile"
  link_item "$repo_root/.zshrc" "$HOME/.zshrc"

  if ((install_tools)); then
    if [[ "$(uname -s)" != "Darwin" ]]; then
      log "Tool installation is currently supported only on macOS."
      exit 1
    fi
    if ! command -v brew >/dev/null 2>&1; then
      log "Homebrew is required for --install: https://brew.sh"
      exit 1
    fi

    run brew bundle --file "$repo_root/Brewfile"
    if [[ -O /opt/homebrew/share ]]; then
      run chmod g-w /opt/homebrew/share
    fi
    run fnm install --lts
    run fnm default lts-latest
    if ! command -v scala-cli >/dev/null 2>&1; then
      run cs install scala-cli:1.11.0
    fi
    if [[ ! -x "$metals_dir/metals" ]]; then
      run mkdir -p "$metals_dir"
      run cs bootstrap --java-opt -Xss4m --java-opt -Xms100m org.scalameta:metals_2.13:1.6.7 -o "$metals_dir/metals" -f
    fi
    run fnm exec --using=default nvim --headless "+Lazy! sync" +qa
    run fnm exec --using=default nvim --headless "+lua print('Neovim startup OK')" "+lua if vim.v.errmsg ~= '' then vim.cmd('cquit') end" +qa
    run fnm exec --using=default nvim --headless "+MasonToolsInstallSync" "+lua if vim.v.errmsg ~= '' then vim.cmd('cquit') end" +qa
    run fnm exec --using=default nvim --headless "+TSInstallConfigured" "+lua if vim.v.errmsg ~= '' then vim.cmd('cquit') end" +qa
  fi

  if [[ -n "$backup_root" ]]; then
    log "Backups stored in: $backup_root"
  fi

  log "Bootstrap complete."
}

main "$@"
