local repo = assert(vim.env.DOTDOTDOT_TEST_REPO)
local theme = require("config.theme")
require("lazy").load({
	plugins = {
		"bufferline.nvim",
		"blink.cmp",
		"mason.nvim",
		"neo-tree.nvim",
		"telescope.nvim",
		"overseer.nvim",
		"vim-dadbod-ui",
		"nvim-dap",
		"which-key.nvim",
	},
})

local function color(group, attribute, expected)
	local actual = vim.api.nvim_get_hl(0, { name = group, link = false })[attribute]
	assert(actual == tonumber(expected:sub(2), 16), group .. ": " .. vim.inspect(actual) .. " != " .. expected)
end

local function verify(mode)
	local p = theme.colors(mode)
	assert(vim.o.background == mode)
	color("Normal", "fg", p.text)
	color("Normal", "bg", p.base)
	color("NormalFloat", "bg", p.surface)
	color("BufferLineBufferSelected", "fg", p.text)
	color("BufferLineBufferSelected", "bg", p.overlay)
	color("BufferLineBackground", "bg", p.surface)
	color("BlinkCmpMenu", "fg", p.text)
	color("BlinkCmpMenu", "bg", p.surface)
	color("MasonHeader", "fg", p.surface)
	color("MasonHeader", "bg", p.pine)
	color("MasonMuted", "fg", p.subtle)
	color("DiagnosticOk", "fg", p.foam)
	color("DapBreakpoint", "fg", p.love)
	color("DapStopped", "fg", p.gold)
	color("NeoTreeNormal", "bg", p.surface)
	color("TelescopeNormal", "fg", p.text)
	color("OverseerSUCCESS", "fg", p.foam)
	color("WhichKeyNormal", "bg", p.surface)
	local ansi, brights = dofile(repo .. "/theme/palette.lua")(repo .. "/theme/palette.tsv").ansi(p)
	for index = 1, 8 do
		assert(
			vim.g["terminal_color_" .. (index - 1)] == ansi[index],
			"ANSI "
				.. (index - 1)
				.. ": "
				.. vim.inspect(vim.g["terminal_color_" .. (index - 1)])
				.. " != "
				.. ansi[index]
		)
		assert(vim.g["terminal_color_" .. (index + 7)] == brights[index], "bright ANSI " .. (index + 7))
	end
	print("PASS installed Neovim " .. mode .. " core, completion, Mason, tree, finder, tasks, debugger, help and ANSI")
end

local config = vim.env.XDG_CONFIG_HOME
for _, mode in ipairs({ "light", "dark", "light" }) do
	vim.fn.writefile({ mode }, config .. "/theme-next")
	assert(vim.uv.fs_rename(config .. "/theme-next", config .. "/dotfiles-theme-system"))
	assert(
		vim.wait(2200, function()
			return vim.o.background == mode
		end),
		"focused editor failed to follow " .. mode
	)
	verify(mode)
end
-- A manual selection wins even as the system cache changes.
vim.fn.writefile({ "dark" }, config .. "/dotfiles-theme")
vim.api.nvim_exec_autocmds("FocusGained", {})
verify("dark")
vim.fn.writefile({ "light" }, config .. "/dotfiles-theme-system")
vim.api.nvim_exec_autocmds("FocusGained", {})
verify("dark")
vim.cmd("qa!")
