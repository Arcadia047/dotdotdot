local wezterm = require("wezterm")
local config = wezterm.config_builder()
local act = wezterm.action

-- Runtime selection is machine-local; bootstrap seeds it from theme.conf.
local theme_file = (os.getenv("XDG_CONFIG_HOME") or (os.getenv("HOME") .. "/.config")) .. "/dotfiles-theme"
wezterm.add_to_config_reload_watch_list(theme_file)
local function read_theme_mode()
	local file = io.open(theme_file, "r")
	if file then
		local mode = (file:read("*l") or ""):match("^%s*(.-)%s*$")
		file:close()
		if mode == "dark" or mode == "light" then
			return mode
		end
	end
	return os.getenv("DOTFILES_THEME") == "light" and "light" or "dark"
end

local theme_mode = read_theme_mode()
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

-- tmux owns tasks and terminal panes. An explicit host whitelist prevents
-- new upstream defaults from silently taking keys away from terminal apps.
config.disable_default_key_bindings = true
config.keys = {
	{ key = "c", mods = "CMD", action = act.CopyTo("Clipboard") },
	{ key = "v", mods = "CMD", action = act.PasteFrom("Clipboard") },
	{ key = "f", mods = "CMD", action = act.Search("CurrentSelectionOrEmptyString") },
	{ key = "=", mods = "CMD", action = act.IncreaseFontSize },
	{ key = "+", mods = "CMD|SHIFT", action = act.IncreaseFontSize },
	{ key = "-", mods = "CMD", action = act.DecreaseFontSize },
	{ key = "0", mods = "CMD", action = act.ResetFontSize },
	{ key = "p", mods = "CMD|SHIFT", action = act.ActivateCommandPalette },
	{ key = "n", mods = "CMD|SHIFT", action = act.SpawnWindow },
	{ key = "w", mods = "CMD|SHIFT", action = act.CloseCurrentTab({ confirm = true }) },
	{ key = "r", mods = "CMD|SHIFT", action = act.ReloadConfiguration },
	{ key = "k", mods = "CMD|SHIFT", action = act.ClearScrollback("ScrollbackAndViewport") },
	{ key = "h", mods = "CMD", action = act.HideApplication },
	{ key = "m", mods = "CMD", action = act.Hide },
	-- Deliberate no-ops: these familiar gestures must not create/close host tabs.
	{ key = "t", mods = "CMD", action = act.Nop },
	{ key = "w", mods = "CMD", action = act.Nop },
	{ key = "n", mods = "CMD", action = act.Nop },
	{ key = "LeftArrow", mods = "OPT", action = act.SendKey({ key = "b", mods = "ALT" }) },
	{ key = "RightArrow", mods = "OPT", action = act.SendKey({ key = "f", mods = "ALT" }) },
}
for number = 1, 9 do
	table.insert(config.keys, { key = tostring(number), mods = "CMD", action = act.Nop })
end

return config
