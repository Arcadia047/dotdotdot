local repo = assert(vim.env.DOTDOTDOT_TEST_REPO)
local failures, checks = 0, 0
local function check(name, fn)
	checks = checks + 1
	local ok, err = pcall(fn)
	if ok then
		print("PASS " .. name)
	else
		failures = failures + 1
		print("FAIL " .. name .. ": " .. tostring(err))
	end
end
local function equal(actual, expected)
	assert(vim.deep_equal(actual, expected), vim.inspect(actual) .. " != " .. vim.inspect(expected))
end
package.path = repo .. "/nvim/lua/?.lua;" .. package.path
local actions = setmetatable({}, {
	__index = function(tbl, name)
		local action = function(value)
			return { name = name, value = value }
		end
		rawset(tbl, name, action)
		return action
	end,
})
local wez_events, wez_children = {}, {}
local system_appearance = "Light"
local wez_global = {}
package.preload.wezterm = function()
	return {
		config_dir = repo .. "/wezterm",
		GLOBAL = wez_global,
		gui = {
			get_appearance = function()
				return system_appearance
			end,
		},
		on = function(name, callback)
			wez_events[name] = callback
		end,
		run_child_process = function(args)
			table.insert(wez_children, args)
			return true, "", ""
		end,
		action = actions,
		config_builder = function()
			return {}
		end,
		font = function(x)
			return x
		end,
		action_callback = function(x)
			return x
		end,
		add_to_config_reload_watch_list = function() end,
	}
end
local wez = dofile(repo .. "/wezterm/wezterm.lua")
local function key(name, mods)
	for _, binding in ipairs(wez.keys) do
		if binding.key == name and binding.mods == mods then
			return binding.action
		end
	end
end
check("host whitelist leaves terminal navigation unclaimed", function()
	equal(wez.disable_default_key_bindings, true)
	for _, letter in ipairs({ "h", "j", "k", "l", "t" }) do
		equal(key(letter, "CTRL"), nil)
	end
	equal(key("LeftArrow", "SHIFT"), nil)
	equal(key("RightArrow", "SHIFT"), nil)
	equal(key("Tab", "CTRL"), nil)
end)
check("accidental host workspace shortcuts are no-ops", function()
	equal(key("t", "CMD"), actions.Nop)
	equal(key("w", "CMD"), actions.Nop)
	for number = 1, 9 do
		equal(key(tostring(number), "CMD"), actions.Nop)
	end
end)
check("infrequent host management is explicitly modified", function()
	equal(key("n", "CMD|SHIFT"), actions.SpawnWindow)
	equal(key("p", "CMD|SHIFT"), actions.ActivateCommandPalette)
	equal(key("w", "CMD|SHIFT").value.confirm, true)
end)
check("host clipboard shortcuts use the system clipboard", function()
	equal(key("c", "CMD"), { name = "CopyTo", value = "Clipboard" })
	equal(key("v", "CMD"), { name = "PasteFrom", value = "Clipboard" })
	equal(key("y", "NONE"), nil)
	equal(key("p", "NONE"), nil)
end)
check("dark file overrides inherited light environment", function()
	vim.env.DOTFILES_THEME = "light"
	local spec = dofile(repo .. "/nvim/lua/plugins/theme.lua")
	equal(require("config.theme").variant(require("config.theme").mode()), "main")
	equal(spec[1].name, "rose-pine")
end)
check("unversioned JDK retains discovered path", function()
	local java = dofile(repo .. "/nvim/lua/config/java.lua")
	local runtime = java.runtimes()[1]
	assert(runtime)
	equal(runtime.path, vim.env.HOMEBREW_PREFIX .. "/opt/openjdk/libexec/openjdk.jdk/Contents/Home")
end)
check("missing requested JDK is rejected", function()
	vim.env.DOTDOTDOT_JAVA_VERSION = "17"
	local java = dofile(repo .. "/nvim/lua/config/java.lua")
	local ok = pcall(java.runtimes)
	vim.env.DOTDOTDOT_JAVA_VERSION = nil
	assert(not ok, "silently selected a different runtime")
end)

local function fixture_jdk(directory, version)
	local home = vim.env.HOMEBREW_PREFIX .. "/" .. directory
	vim.fn.mkdir(home .. "/bin", "p")
	vim.fn.writefile({ "#!/bin/sh", "exit 0" }, home .. "/bin/java")
	vim.uv.fs_chmod(home .. "/bin/java", 493)
	vim.fn.writefile({ 'JAVA_VERSION="' .. version .. '.0.1"' }, home .. "/release")
	return home
end
check("Java 17 project runs with independent Java 25 launcher", function()
	local java = dofile(repo .. "/nvim/lua/config/java.lua")
	fixture_jdk("opt/openjdk@17/libexec/openjdk.jdk/Contents/Home", "17")
	vim.env.DOTDOTDOT_JAVA_VERSION = "17"
	equal(java.project().version, "17")
	equal(java.launcher().version, "25")
	vim.env.DOTDOTDOT_JDTLS_JAVA_VERSION = "17"
	assert(not pcall(java.launcher), "accepted Java 17 for jdtls")
	vim.env.DOTDOTDOT_JAVA_VERSION = nil
	vim.env.DOTDOTDOT_JDTLS_JAVA_VERSION = nil
end)
check("custom JAVA_HOME is used verbatim", function()
	local java = dofile(repo .. "/nvim/lua/config/java.lua")
	local home = fixture_jdk("custom JDK/Contents/Home", "21")
	vim.env.JAVA_HOME = home
	equal(java.project().path, home)
	equal(java.project().version, "21")
	equal(java.launcher().version, "25")
	vim.env.JAVA_HOME = nil
end)
check("invalid explicit JAVA_HOME is rejected", function()
	vim.env.JAVA_HOME = "/no-such-jdk"
	assert(not pcall(dofile(repo .. "/nvim/lua/config/java.lua").runtimes))
	vim.env.JAVA_HOME = nil
end)
check("both terminal and editor honor the theme file", function()
	local state = vim.env.XDG_CONFIG_HOME .. "/dotfiles-theme"
	for _, mode in ipairs({ "light", "dark" }) do
		vim.fn.writefile({ mode }, state)
		vim.env.DOTFILES_THEME = mode == "light" and "dark" or "light"
		equal(require("config.theme").mode(), mode)
		equal(dofile(repo .. "/wezterm/wezterm.lua").color_scheme, mode == "light" and "rose-pine-dawn" or "rose-pine")
	end
end)
check("missing or invalid theme state defaults to light but respects explicit dark", function()
	local state = vim.env.XDG_CONFIG_HOME .. "/dotfiles-theme"
	local theme = require("config.theme")
	for _, contents in ipairs({ {}, { "invalid" } }) do
		if #contents == 0 then
			vim.fn.delete(state)
		else
			vim.fn.writefile(contents, state)
		end
		for _, env_mode in ipairs({ "", "invalid", "light", "dark" }) do
			vim.env.DOTFILES_THEME = env_mode
			local expected = env_mode == "dark" and "dark" or "light"
			equal(theme.mode(), expected)
			local terminal = dofile(repo .. "/wezterm/wezterm.lua")
			equal(terminal.color_scheme, expected == "dark" and "rose-pine" or "rose-pine-dawn")
			equal(terminal.set_environment_variables.COLORFGBG, expected == "dark" and "15;0" or "0;15")
		end
	end
	vim.fn.writefile({ "dark" }, state)
end)
check("native appearance events follow auto and preserve manual overrides", function()
	local state = vim.env.XDG_CONFIG_HOME .. "/dotfiles-theme"
	vim.fn.writefile({ "auto" }, state)
	vim.env.DOTFILES_THEME = "dark"
	system_appearance = "Light"
	local terminal = dofile(repo .. "/wezterm/wezterm.lua")
	equal(terminal.color_scheme, "rose-pine-dawn")
	equal(#wez_children, 0) -- Config evaluation must never spawn a synchronizer.
	local overrides, appearance, override_calls =
		{ font_size = 19, window_frame = { font_size = 11 } }, "LightHighContrast", 0
	local window = {
		get_appearance = function()
			return appearance
		end,
		get_config_overrides = function()
			return vim.deepcopy(overrides)
		end,
		set_config_overrides = function(_, value)
			overrides = value
			override_calls = override_calls + 1
		end,
	}
	local event = assert(wez_events["window-config-reloaded"])
	event(window)
	equal(overrides.color_scheme, "rose-pine-dawn")
	equal(overrides.font_size, 19)
	equal(overrides.window_frame.font_size, 11)
	equal(overrides.set_environment_variables.COLORFGBG, "0;15")
	equal(#wez_children, 1)
	event(window) -- Overrides re-emit this event; no loop or duplicate sync.
	equal(override_calls, 1)
	equal(#wez_children, 1)
	appearance = "DarkHighContrast"
	event(window)
	equal(overrides.color_scheme, "rose-pine")
	equal(overrides.set_environment_variables.DOTFILES_THEME, "dark")
	equal(overrides.colors.foreground, "#e0def4")
	equal(overrides.command_palette_fg_color, "#e0def4")
	equal(#wez_children, 2)
	equal(wez_children[2][6], "dark")
	vim.fn.writefile({ "light" }, state)
	event(window)
	equal(overrides.color_scheme, "rose-pine-dawn")
	equal(#wez_children, 2)
	vim.fn.writefile({ "dark" }, state)
end)
check("terminal text, selection and UI use the selected palette", function()
	local state = vim.env.XDG_CONFIG_HOME .. "/dotfiles-theme"
	for _, mode in ipairs({ "light", "dark", "light" }) do
		vim.fn.writefile({ mode }, state)
		local terminal = dofile(repo .. "/wezterm/wezterm.lua")
		local text = mode == "light" and "#464261" or "#e0def4"
		local base = mode == "light" and "#faf4ed" or "#191724"
		local selected = mode == "light" and "#dfdad9" or "#403d52"
		assert(terminal.colors, "terminal colors still depend on bundled scheme defaults")
		equal(terminal.colors.foreground, text)
		equal(terminal.colors.background, base)
		equal(terminal.colors.selection_fg, text)
		equal(terminal.colors.selection_bg, selected)
		equal(terminal.colors.ansi[8], text)
		equal(terminal.colors.brights[8], text)
		equal(terminal.colors.tab_bar.inactive_tab.fg_color, text)
		equal(terminal.command_palette_fg_color, text)
		equal(terminal.window_frame.active_titlebar_bg, base)
	end
	vim.fn.writefile({ "dark" }, state)
end)
check("auto mode refreshes the focused editor after atomic state replacement", function()
	local config = vim.env.XDG_CONFIG_HOME
	local theme = require("config.theme")
	vim.fn.writefile({ "auto" }, config .. "/dotfiles-theme")
	vim.fn.writefile({ "light" }, config .. "/dotfiles-theme-system")
	local observed = theme.mode()
	equal(observed, "light")
	theme.watch(function()
		observed = theme.mode()
	end)
	vim.fn.writefile({ "dark" }, config .. "/theme-replacement")
	assert(vim.uv.fs_rename(config .. "/theme-replacement", config .. "/dotfiles-theme-system"))
	assert(
		vim.wait(2000, function()
			return observed == "dark"
		end),
		"Dark appearance was not observed"
	)
	vim.fn.writefile({ "light" }, config .. "/theme-replacement")
	assert(vim.uv.fs_rename(config .. "/theme-replacement", config .. "/dotfiles-theme"))
	assert(
		vim.wait(2000, function()
			return observed == "light"
		end),
		"Manual override was not observed"
	)
	theme.watcher:stop()
	theme.watcher:close()
	theme.watcher = nil
	vim.fn.writefile({ "dark" }, config .. "/dotfiles-theme")
end)
print(string.format("%d checks, %d failures", checks, failures))
if failures > 0 then
	vim.cmd("cquit")
end
