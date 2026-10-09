local map = vim.keymap.set

-- Ordinary commands use local registers; clipboard access is deliberate.
map({ "n", "x" }, "<leader>y", '"+y', { desc = "Copy to System Clipboard" })
map("n", "<leader>p", '"+p', { desc = "Paste from System Clipboard" })
map("x", "<leader>p", '"+P', { desc = "Replace from System Clipboard" })
-- Native visual P preserves the source register for repeated replacement.
for _, key in ipairs({ "p", "P" }) do
	map("x", key, "P", { desc = "Replace Without Changing Source" })
end

map("n", "<Esc>", "<cmd>nohlsearch<cr>", { desc = "Clear Search Highlight" })
require("config.navigation").setup()

map("n", "<leader>cd", vim.diagnostic.open_float, { desc = "Line Diagnostics" })
map("n", "]d", function()
	vim.diagnostic.jump({ count = 1, float = true })
end, { desc = "Next Diagnostic" })
map("n", "[d", function()
	vim.diagnostic.jump({ count = -1, float = true })
end, { desc = "Previous Diagnostic" })
map("n", "<leader>cq", vim.diagnostic.setqflist, { desc = "Diagnostics to Quickfix" })
map("n", "]q", "<cmd>cnext<cr>", { desc = "Next Quickfix" })
map("n", "[q", "<cmd>cprevious<cr>", { desc = "Previous Quickfix" })

local function open_lazygit()
	if vim.fn.executable("lazygit") ~= 1 then
		vim.notify("lazygit is not installed", vim.log.levels.ERROR)
		return
	end

	vim.cmd.tabnew()
	local bufnr = vim.api.nvim_get_current_buf()
	vim.bo[bufnr].bufhidden = "wipe"
	vim.fn.jobstart({ "lazygit" }, {
		term = true,
		on_exit = function()
			vim.schedule(function()
				if vim.api.nvim_buf_is_valid(bufnr) then
					vim.api.nvim_buf_delete(bufnr, { force = true })
				end
			end)
		end,
	})
	vim.cmd.startinsert()
end

map("n", "<leader>gg", open_lazygit, { desc = "LazyGit" })
