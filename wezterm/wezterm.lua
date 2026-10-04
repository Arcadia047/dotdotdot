local wezterm = require("wezterm")
local config = wezterm.config_builder()
local act = wezterm.action

-- Runtime selection is machine-local; bootstrap seeds it from theme.conf.
local theme_file = (os.getenv("XDG_CONFIG_HOME") or (os.getenv("HOME") .. "/.config")) .. "/dotfiles-theme"
wezterm.add_to_config_reload_watch_list(theme_file)
local function read_theme_selection()
	local file = io.open(theme_file, "r")
	if file then
		local mode = (file:read("*l") or ""):match("^%s*(.-)%s*$")
		file:close()
		if mode == "auto" or mode == "dark" or mode == "light" then
			return mode
		end
	end
	return os.getenv("DOTFILES_THEME") == "dark" and "dark" or "light"
end

local function system_theme_mode(appearance)
	if appearance then
		return appearance:find("Dark") and "dark" or "light"
	end
	if wezterm.gui then
		return system_theme_mode(wezterm.gui.get_appearance())
	end
	-- CLI config parsing has no GUI; use the last appearance published by it.
	local file = io.open(theme_file .. "-system", "r")
	if file then
		local mode = file:read("*l")
		file:close()
		if mode == "dark" or mode == "light" then
			return mode
		end
	end
	return os.getenv("DOTFILES_THEME") == "dark" and "dark" or "light"
end

local selection = read_theme_selection()
local theme_mode = selection == "auto" and system_theme_mode() or selection
local color_schemes = {
	dark = "rose-pine",
	light = "rose-pine-dawn",
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
	-- OMP uses this fallback before its OSC 11 background query completes.
	COLORFGBG = theme_mode == "dark" and "15;0" or "0;15",
}

-- macOS appearance changes emit this event. Publish once per resolved mode;
-- configuration evaluation itself stays free of writes and child processes.
wezterm.on("window-config-reloaded", function(window)
	local choice = read_theme_selection()
	local mode = choice == "auto" and system_theme_mode(window:get_appearance()) or choice
	local overrides = window:get_config_overrides() or {}
	local colorfgbg = mode == "dark" and "15;0" or "0;15"
	local environment = overrides.set_environment_variables or {}
	if
		overrides.color_scheme ~= color_schemes[mode]
		or environment.DOTFILES_THEME ~= mode
		or environment.COLORFGBG ~= colorfgbg
	then
		overrides.color_scheme = color_schemes[mode]
		environment.DOTFILES_THEME = mode
		environment.COLORFGBG = colorfgbg
		overrides.set_environment_variables = environment
		window:set_config_overrides(overrides)
	end
	local key = choice .. ":" .. mode
	if choice == "auto" and wezterm.GLOBAL.dotdotdot_theme_mode ~= key then
		local ok, _, stderr = wezterm.run_child_process({
			"/bin/zsh",
			"-dfc",
			'source "$1"; _dotdotdot_sync_system_theme "$2" force',
			"dotdotdot-theme",
			wezterm.config_dir .. "/../zsh/theme.zsh",
			mode,
		})
		if not ok then
			wezterm.log_error("Theme sync failed: " .. stderr)
			return
		end
	end
	wezterm.GLOBAL.dotdotdot_theme_mode = key
end)

-- Use the native Metal renderer on macOS.
config.front_end = "WebGpu"

-- Appearance
config.hide_tab_bar_if_only_one_tab = true
-- Avoid macOS Tahoe repeatedly compositing the idle window shadow.
-- See docs/wezterm-windowserver-gpu.md for the controlled live comparison.
-- MACOS_USE_BACKGROUND_COLOR_AS_TITLEBAR_COLOR paints the native titlebar with the
-- color scheme background instead of leaving it to the system material: wezterm hands the
-- window a *clear* background color when it is opaque (window_background_color() ->
-- clearColor), which macOS 26/27 composites as a see-through titlebar while other apps'
-- bars stay solid. Nightly-only flag, matching this machine's nightly build.
config.window_decorations = "TITLE | RESIZE | MACOS_FORCE_DISABLE_SHADOW | MACOS_USE_BACKGROUND_COLOR_AS_TITLEBAR_COLOR"
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
