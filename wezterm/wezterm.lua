local wezterm = require("wezterm")
local config = wezterm.config_builder()
local act = wezterm.action

-- One explicit switch keeps WezTerm, tmux, and Neovim on the same palette.
-- The single source of truth is the repo's theme.conf, installed by bootstrap
-- as ~/.config/dotfiles-theme ("dark" or "light"). Switch it with `theme light|dark`.
local function read_theme_mode()
	local file = io.open(os.getenv("HOME") .. "/.config/dotfiles-theme", "r")
	if not file then
		return "dark"
	end
	local mode = file:read("*l")
	file:close()
	if mode == "light" then
		return "light"
	end
	return "dark"
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

-- Key bindings
--
-- Universal navigation model (see KEYBINDINGS.md): the innermost running
-- layer (AeroSpace > WezTerm > tmux > Neovim) claims the gesture:
--   Ctrl+hjkl       focus among visible panes/splits
--   Shift+Left/Right previous/next tab·window·buffer
--   Cmd+1..9        jump to WezTerm tab N (built-in default)
-- WezTerm bindings below only fire on bare shells; when tmux or Neovim is
-- the foreground process the raw key is forwarded so the inner layer handles it.
local function inner_app_claims_keys(pane)
	local fg = pane.foreground_process_name or ""
	local name = fg:match("([^/\\]+)$") or ""
	return name == "tmux" or name == "nvim"
end

local function forward_or(raw_key, inner_action)
	return wezterm.action_callback(function(window, pane)
		if inner_app_claims_keys(pane) then
			window:perform_action(act.SendKey(raw_key), pane)
		else
			window:perform_action(inner_action, pane)
		end
	end)
end

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

	-- Shift+Left/Right: previous/next tab (bare shells only)
	{
		key = "LeftArrow",
		mods = "SHIFT",
		action = forward_or({ key = "LeftArrow", mods = "SHIFT" }, act.ActivateTabRelative(-1)),
	},
	{
		key = "RightArrow",
		mods = "SHIFT",
		action = forward_or({ key = "RightArrow", mods = "SHIFT" }, act.ActivateTabRelative(1)),
	},

	-- Ctrl+hjkl: focus pane in the given direction (bare shells only).
	-- Note: literal Ctrl-h is readline backspace; the Backspace key is unaffected.
	{ key = "h", mods = "CTRL", action = forward_or({ key = "h", mods = "CTRL" }, act.ActivatePaneDirection("Left")) },
	{ key = "j", mods = "CTRL", action = forward_or({ key = "j", mods = "CTRL" }, act.ActivatePaneDirection("Down")) },
	{ key = "k", mods = "CTRL", action = forward_or({ key = "k", mods = "CTRL" }, act.ActivatePaneDirection("Up")) },
	{ key = "l", mods = "CTRL", action = forward_or({ key = "l", mods = "CTRL" }, act.ActivatePaneDirection("Right")) },
}

return config
