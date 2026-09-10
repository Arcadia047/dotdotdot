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
package.preload.wezterm = function()
	return {
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
check("dark file overrides inherited light environment", function()
	vim.env.DOTFILES_THEME = "light"
	local spec = dofile(repo .. "/nvim/lua/plugins/theme.lua")
	equal(spec[1].opts.flavour, "macchiato")
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
		equal(
			dofile(repo .. "/wezterm/wezterm.lua").color_scheme,
			mode == "light" and "Catppuccin Latte" or "Catppuccin Macchiato"
		)
	end
end)
print(string.format("%d checks, %d failures", checks, failures))
if failures > 0 then
	vim.cmd("cquit")
end
