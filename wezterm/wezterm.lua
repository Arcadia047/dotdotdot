local wezterm = require("wezterm")
local config = wezterm.config_builder()
local act = wezterm.action

-- Font configuration
config.font = wezterm.font({
	family = "Maple Mono NF",
	harfbuzz_features = { "calt=0" }, -- Disable ligatures
})
config.font_size = 26.0

config.color_scheme = "tokyonight"

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
config.scrollback_lines = 2000

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
		action = wezterm.action.ClearScrollback("ScrollbackOnly"),
		-- action = wezterm.action.Multiple({
		-- 	act.ClearScrollback("ScrollbackAndViewport"),
		-- 	act.SendKey({ key = "L", mods = "CTRL" }),
		-- }),
	},
	-- Move cursor word by word (without selecting)
	{ key = "LeftArrow", mods = "OPT", action = act.SendKey({ key = "b", mods = "ALT" }) },
	{ key = "RightArrow", mods = "OPT", action = act.SendKey({ key = "f", mods = "ALT" }) },
}

return config
