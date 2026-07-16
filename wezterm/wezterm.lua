local wezterm = require("wezterm")
local config = wezterm.config_builder()
local act = wezterm.action

-- One explicit switch keeps WezTerm, tmux, and Neovim on the same palette.
-- Change this to "light" to use Catppuccin Latte everywhere on the next launch.
local theme_mode = "dark"
local color_schemes = {
	dark = "Catppuccin Macchiato",
	light = "Catppuccin Latte",
}

-- Font configuration
config.font = wezterm.font({
	family = "Maple Mono NF",
	harfbuzz_features = { "calt=0" }, -- Disable ligatures
})
config.font_size = 20.0

config.color_scheme = color_schemes[theme_mode]
config.set_environment_variables = {
	DOTFILES_THEME = theme_mode,
}

-- Appearance
config.hide_tab_bar_if_only_one_tab = true
-- config.window_decorations = "RESIZE"
config.window_background_opacity = 1.0
config.line_height = 1.0
config.cell_width = 1.0
config.adjust_window_size_when_changing_font_size = false
config.window_padding = {
	left = "1cell",
	right = "1cell",
	top = "0.5cell",
	bottom = 0,
}

-- Scrollback
config.scrollback_lines = 10000
config.window_close_confirmation = "AlwaysPrompt"
config.skip_close_confirmation_for_processes_named = {}

-- Key bindings
config.keys = {
	-- Ctrl+T to create a new tab with the current working directory
	{
		key = "t",
		mods = "CTRL",
		action = wezterm.action.SpawnTab("CurrentPaneDomain"),
	},
	{
		key = "k",
		mods = "CMD",
		action = wezterm.action.Multiple({
			act.ClearScrollback("ScrollbackAndViewport"),
			act.SendKey({ key = "L", mods = "CTRL" }),
		}),
	},
	{
		key = "w",
		mods = "CMD",
		action = act.CloseCurrentTab({ confirm = true }),
	},
	-- Move cursor word by word (without selecting)
	{ key = "LeftArrow", mods = "OPT", action = act.SendKey({ key = "b", mods = "ALT" }) },
	{ key = "RightArrow", mods = "OPT", action = act.SendKey({ key = "f", mods = "ALT" }) },
}

return config
