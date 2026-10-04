local M = {}

local function read_mode(file)
	local ok, lines = pcall(vim.fn.readfile, file)
	return ok and lines[1] and vim.trim(lines[1]) or nil
end

function M.mode()
	local config = vim.env.XDG_CONFIG_HOME or vim.fn.expand("~/.config")
	local mode = read_mode(config .. "/dotfiles-theme")
	if mode == "dark" or mode == "light" then
		return mode
	end
	if mode == "auto" then
		local system = read_mode(config .. "/dotfiles-theme-system")
		if system == "dark" or system == "light" then
			return system
		end
		local result = vim.system({ "/usr/bin/defaults", "read", "-g", "AppleInterfaceStyle" }, { text = true })
			:wait(1000)
		return result.code == 0 and vim.trim(result.stdout or "") == "Dark" and "dark" or "light"
	end
	return vim.env.DOTFILES_THEME == "dark" and "dark" or "light"
end

function M.watch(callback)
	if M.watcher then
		M.watcher:stop()
		M.watcher:close()
	end
	-- Read two tiny local files once a second. macOS FSEvents may refuse new
	-- watches (EMFILE); a timer also survives atomic renames and missing files.
	-- The OS appearance query only runs when auto's published cache is absent.
	M.watcher = assert(vim.uv.new_timer())
	M.watcher:start(1000, 1000, vim.schedule_wrap(callback))
	vim.api.nvim_create_autocmd("VimLeavePre", {
		group = vim.api.nvim_create_augroup("UserThemeWatcher", { clear = true }),
		callback = function()
			if M.watcher and not M.watcher:is_closing() then
				M.watcher:stop()
				M.watcher:close()
			end
		end,
	})
end

function M.variant(mode)
	return mode == "dark" and "main" or "dawn"
end

return M
