local wezterm = require 'wezterm'
local config = wezterm.config_builder()
local act = wezterm.action

-- Font configuration
config.font = wezterm.font {
    family = 'JetBrains Mono',
    harfbuzz_features = { 'calt=0' }, -- Disable ligatures
}
config.font_size = 18.0

-- Appearance
config.window_background_opacity = 0.9
config.line_height = 1.0
config.cell_width = 1.0
config.adjust_window_size_when_changing_font_size = false
config.window_decorations = "RESIZE" -- Similar to minimal borders

-- Scrollback
config.scrollback_lines = 2000

-- Key bindings
config.keys = {
    -- Ctrl+T to create a new tab with the current working directory
    {
        key = 't',
        mods = 'CTRL',
        action = wezterm.action.SpawnTab 'CurrentPaneDomain',
    },
    {
        key = 'k',
        mods = 'CMD',
        action = act.Multiple {
            act.ClearScrollback 'ScrollbackAndViewport'
        },
    }
}

config.color_scheme = 'nord'

return config
