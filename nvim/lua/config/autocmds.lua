local group = vim.api.nvim_create_augroup("UserConfig", { clear = true })

vim.api.nvim_create_autocmd("TextYankPost", {
	group = group,
	desc = "Highlight yanked text",
	callback = function()
		vim.highlight.on_yank({ timeout = 150 })
	end,
})

vim.api.nvim_create_autocmd({ "FocusGained", "TermClose", "TermLeave" }, {
	group = group,
	desc = "Reload files changed outside Neovim",
	command = "checktime",
})

vim.api.nvim_create_autocmd("BufReadPost", {
	group = group,
	desc = "Return to the last edit position",
	callback = function(args)
		local mark = vim.api.nvim_buf_get_mark(args.buf, '"')
		local line_count = vim.api.nvim_buf_line_count(args.buf)
		if mark[1] > 0 and mark[1] <= line_count then
			pcall(vim.api.nvim_win_set_cursor, 0, mark)
		end
	end,
})

vim.api.nvim_create_autocmd("VimResized", {
	group = group,
	desc = "Keep splits evenly sized",
	command = "tabdo wincmd =",
})

vim.api.nvim_create_autocmd("FileType", {
	group = group,
	pattern = { "help", "qf", "checkhealth", "lspinfo", "man" },
	desc = "Close utility windows with q",
	callback = function(args)
		vim.keymap.set("n", "q", "<cmd>close<cr>", { buffer = args.buf, silent = true, desc = "Close Window" })
	end,
})

vim.api.nvim_create_autocmd("FileType", {
	group = group,
	pattern = "*",
	desc = "Do not continue comments on a new line",
	callback = function()
		vim.opt_local.formatoptions:remove({ "c", "r", "o" })
	end,
})

vim.api.nvim_create_autocmd("FileType", {
	group = group,
	pattern = "go",
	desc = "Use Go indentation defaults",
	callback = function()
		vim.opt_local.expandtab = false
		vim.opt_local.tabstop = 4
		vim.opt_local.shiftwidth = 4
		vim.opt_local.softtabstop = 4
	end,
})

vim.api.nvim_create_autocmd("FileType", {
	group = group,
	pattern = "make",
	desc = "Preserve tabs in Makefiles",
	callback = function()
		vim.opt_local.expandtab = false
	end,
})
