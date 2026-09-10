local M = {}

function M.mode()
	local config = vim.env.XDG_CONFIG_HOME or vim.fn.expand("~/.config")
	local ok, lines = pcall(vim.fn.readfile, config .. "/dotfiles-theme")
	if ok and lines[1] then
		local mode = vim.trim(lines[1])
		if mode == "dark" or mode == "light" then
			return mode
		end
	end
	return vim.env.DOTFILES_THEME == "light" and "light" or "dark"
end

function M.flavor(mode)
	return mode == "light" and "latte" or "macchiato"
end

return M
