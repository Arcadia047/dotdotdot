# fnm remains the only Node version resolver (including recursive files/engines).
# Directory changes and prompts may activate installed versions, never install.
if (( $+commands[fnm] )); then
  autoload -Uz add-zsh-hook
  # Remove the old interactive auto-install hook when reloading this shell.
  add-zsh-hook -d chpwd _fnm_autoload_hook
  eval "$(fnm env --version-file-strategy=recursive --corepack-enabled --shell zsh)"

  _dotdotdot_node_refresh() {
    local message previous="${DOTDOTDOT_NODE_ERROR:-}"
    if message="$(fnm use --silent-if-unchanged </dev/null 2>&1)"; then
      unset DOTDOTDOT_NODE_ERROR DOTDOTDOT_NODE_ACTIVE
      [[ -z "$message" ]] || print -r -- "$message"
    else
      typeset -g DOTDOTDOT_NODE_ERROR="$message"
      typeset -g DOTDOTDOT_NODE_ACTIVE="$(fnm current 2>/dev/null)"
      if [[ "$previous" != "$message" ]]; then
        print -u2 -r -- "$message"
        print -u2 -r -- "Active Node: ${DOTDOTDOT_NODE_ACTIVE:-none}. Set up this project explicitly: fnm install && fnm use"
      fi
    fi
    # A failed activation must not change the success status of directory navigation.
    return 0
  }
  add-zsh-hook chpwd _dotdotdot_node_refresh
  # Recheck after explicit installation/use and edits to the project's version file.
  add-zsh-hook precmd _dotdotdot_node_refresh
  _dotdotdot_node_refresh
fi

# Powerlevel10k displays unresolved activation on every prompt until repaired.
prompt_node_warning() {
  [[ -n "${DOTDOTDOT_NODE_ERROR:-}" ]] || return 0
  p10k segment -f "${DOTDOTDOT_COLORS[love]:-red}" \
    -t "Node requirement unmet (active ${DOTDOTDOT_NODE_ACTIVE:-none})"
}
