# Machine-local state shared by WezTerm, tmux, and Neovim. Never write through
# an old symlink into the checkout; rename a sibling file over it atomically.
theme() {
  local file="${XDG_CONFIG_HOME:-$HOME/.config}/dotfiles-theme"
  local mode temporary
  if (( $# == 0 )); then
    [[ -r "$file" ]] && read -r mode < "$file"
    case "$mode" in dark|light) print -r -- "$mode" ;; *) print dark ;; esac
    return 0
  fi
  if (( $# != 1 )) || [[ "$1" != dark && "$1" != light ]]; then
    print -u2 'usage: theme [dark|light]'
    return 1
  fi
  mkdir -p "${file:h}" || return 1
  temporary="$(mktemp "${file}.XXXXXX")" || return 1
  if ! print -r -- "$1" > "$temporary" || ! mv -f -- "$temporary" "$file"; then
    rm -f -- "$temporary"
    return 1
  fi
  export DOTFILES_THEME="$1"
  # WezTerm watches the state file directly. Neovim refreshes on FocusGained.
  # Refresh an existing tmux server even when this shell is outside tmux.
  if (( $+commands[tmux] )) && tmux has-session 2>/dev/null; then
    tmux set-environment -g DOTFILES_THEME "$1"
    tmux source-file "$HOME/.tmux.conf" || return 1
    tmux refresh-client -S 2>/dev/null || true
  fi
  print "theme set to $1"
}
