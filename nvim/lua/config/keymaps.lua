local map = vim.keymap.set

map("n", "<Esc>", "<cmd>nohlsearch<cr>", { desc = "Clear Search Highlight" })
map("n", "<leader><Tab>", "<C-^>", { desc = "Alternate Buffer" })

-- Universal navigation model (see KEYBINDINGS.md): Shift+Left/Right moves to
-- the previous/next buffer, matching WezTerm tabs and tmux windows.
map("n", "<S-Left>", "<cmd>bprevious<cr>", { desc = "Previous Buffer" })
map("n", "<S-Right>", "<cmd>bnext<cr>", { desc = "Next Buffer" })

-- Splits match tmux: | vertical, - horizontal.
map("n", "<leader>|", "<cmd>vsplit<cr>", { desc = "Split Right" })
map("n", "<leader>-", "<cmd>split<cr>", { desc = "Split Below" })
map("n", "<leader><Tab>", "<C-^>", { desc = "Alternate Buffer" })

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
