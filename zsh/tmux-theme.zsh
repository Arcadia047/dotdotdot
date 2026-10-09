# Invoked synchronously by tmux; one batch applies the shared palette to all UI.
source "${${(%):-%x}:A:h}/theme.zsh"
local accent="$DOTDOTDOT_COLORS[pine]" active_text="$DOTDOTDOT_COLORS[surface]"
if [[ "$DOTFILES_THEME" == dark ]]; then
  accent="$DOTDOTDOT_COLORS[iris]"
  active_text="$DOTDOTDOT_COLORS[base]"
fi
local -a theme_commands
local role
for role in ${(k)DOTDOTDOT_COLORS}; do
  theme_commands+=(set-option -g "@dotdotdot_$role" "$DOTDOTDOT_COLORS[$role]" ';')
done
theme_commands+=(
  set-option -g @dotdotdot_tab_text "$DOTDOTDOT_COLORS[text]" ';'
  set-option -g @dotdotdot_tab_background "$DOTDOTDOT_COLORS[overlay]" ';'
  set-option -g @dotdotdot_tab_number "$DOTDOTDOT_COLORS[highlight_med]" ';'
  set-option -g @dotdotdot_tab_active "$accent" ';'
  set-option -g @dotdotdot_tab_active_text "$active_text" ';'
  set-option -g status-style "fg=$DOTDOTDOT_COLORS[subtle],bg=$DOTDOTDOT_COLORS[base]" ';'
  set-option -g message-style "fg=$DOTDOTDOT_COLORS[text],bg=$DOTDOTDOT_COLORS[surface],fill=$DOTDOTDOT_COLORS[surface]" ';'
  set-option -g message-command-style "fg=$DOTDOTDOT_COLORS[text],bg=$DOTDOTDOT_COLORS[surface],fill=$DOTDOTDOT_COLORS[surface]" ';'
  set-option -g mode-style "fg=$DOTDOTDOT_COLORS[text],bg=$DOTDOTDOT_COLORS[highlight_med]" ';'
  set-option -g copy-mode-match-style "fg=$DOTDOTDOT_COLORS[text],bg=$DOTDOTDOT_COLORS[highlight_med]" ';'
  set-option -g copy-mode-current-match-style "fg=$active_text,bg=$accent" ';'
  set-option -g copy-mode-mark-style "fg=$active_text,bg=$accent" ';'
  set-option -g menu-style "fg=$DOTDOTDOT_COLORS[text],bg=$DOTDOTDOT_COLORS[surface]" ';'
  set-option -g menu-selected-style "fg=$active_text,bg=$accent,bold" ';'
  set-option -g menu-border-style "fg=$DOTDOTDOT_COLORS[subtle],bg=$DOTDOTDOT_COLORS[surface]" ';'
  set-option -g popup-style "fg=$DOTDOTDOT_COLORS[text],bg=$DOTDOTDOT_COLORS[base]" ';'
  set-option -g popup-border-style "fg=$DOTDOTDOT_COLORS[subtle],bg=$DOTDOTDOT_COLORS[base]" ';'
)
local tmux_binary="${commands[tmux]:-${HOMEBREW_PREFIX:-/opt/homebrew}/bin/tmux}"
"$tmux_binary" "${theme_commands[@]}"
