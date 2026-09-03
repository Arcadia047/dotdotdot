local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"

local function locked_lazy_commit()
	local lockfile = vim.fn.stdpath("config") .. "/lazy-lock.json"
	local ok, contents = pcall(vim.fn.readfile, lockfile)
	if not ok then
		return nil
	end

	local decoded_ok, lock = pcall(vim.json.decode, table.concat(contents, "\n"))
	if not decoded_ok or not lock["lazy.nvim"] then
		return nil
	end
	return lock["lazy.nvim"].commit
end

local function abort_bootstrap(message, output)
	vim.api.nvim_echo({ { message .. "\n", "ErrorMsg" }, { output, "WarningMsg" } }, true, {})
	os.exit(1)
end

if not (vim.uv or vim.loop).fs_stat(lazypath) then
	local lazyrepo = "https://github.com/folke/lazy.nvim.git"
	local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
	if vim.v.shell_error ~= 0 then
		abort_bootstrap("Failed to clone lazy.nvim:", out)
	end

	local commit = locked_lazy_commit()
	if commit then
		out = vim.fn.system({ "git", "-C", lazypath, "checkout", "--detach", commit })
		if vim.v.shell_error ~= 0 then
			abort_bootstrap("Failed to restore the locked lazy.nvim revision:", out)
		end
	end
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
	spec = {
		{ import = "plugins" },
	},
	defaults = {
		lazy = true,
		version = false,
	},
	install = { colorscheme = { "catppuccin" } },
	checker = { enabled = false },
	rocks = { enabled = false },
	change_detection = { notify = false },
	performance = {
		rtp = {
			disabled_plugins = {
				"gzip",
				"tarPlugin",
				"tohtml",
				"tutor",
				"zipPlugin",
			},
		},
	},
})
