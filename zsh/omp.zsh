# Kitty cursor placements bypass tmux's grid: scrolling/reflow can scatter them
# across panes and the status bar. Native SIXEL lets tmux own those pixels.
# Query the attached client each launch; inherited WEZTERM_PANE can be stale.
omp() {
  emulate -L zsh
  if [[ -n ${TMUX-} && -n ${TMUX_PANE-} && -z ${PI_FORCE_IMAGE_PROTOCOL-} ]] \
    && (( $+commands[tmux] )); then
    local reply
    local -a capabilities
    reply=$(command tmux display-message -p -t "$TMUX_PANE" \
      '#{sixel_support}|#{client_termfeatures}|#{client_termtype}' 2>/dev/null)
    capabilities=("${(@s:|:)reply}")
    if [[ ${capabilities[1]} == 1 && ,${capabilities[2]}, == *,sixel,* \
      && ${capabilities[3]:l} == wezterm* ]]; then
      PI_FORCE_IMAGE_PROTOCOL=sixel command omp "$@"
      return $?
    fi
  fi
  command omp "$@"
}
