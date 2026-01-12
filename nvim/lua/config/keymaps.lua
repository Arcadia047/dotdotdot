local map = vim.keymap.set

-- File Navigation
map("n", "<leader><space>", "<cmd>Telescope find_files<cr>", { desc = "Find File" })
map("n", "<leader>/", "<cmd>Telescope live_grep<cr>", { desc = "Grep (Find Text)" })
map("n", "<leader>fb", "<cmd>Telescope buffers<cr>", { desc = "Find Buffer" })
map("n", "<leader>e", "<cmd>Neotree toggle<cr>", { desc = "Explorer" })

-- LSP (Standardized & Intuitive)
-- Note: 'K' for Hover and 'gd' for definition are built-in.
map("n", "<leader>ca", vim.lsp.buf.code_action, { desc = "Code Action" })
map("n", "<leader>cr", vim.lsp.buf.rename, { desc = "Rename" })
map("n", "<leader>cf", function()
	require("lazyvim.util").format({ force = true })
end, { desc = "Format File" })

-- Diagnostics
map("n", "<leader>cd", vim.diagnostic.open_float, { desc = "Line Diagnostics" })
map("n", "]d", vim.diagnostic.goto_next, { desc = "Next Diagnostic" })
map("n", "[d", vim.diagnostic.goto_prev, { desc = "Prev Diagnostic" })
