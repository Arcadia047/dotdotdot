local set = vim.keymap.set;

vim.g.mapleader = " "

-- use J or K to move highlighted text up or down
set("v", "J", ":m '>+1<CR>gv=gv")
set("v", "K", ":m '<-2<CR>gv=gv")

-- keep cursor still when merging next line with current line
set("n", "J", "mzJ`z")

-- ctrl-d(own) and ctrl-u(p) will keep cursor line in the center of the screen
set("n", "<C-d>", "<C-d>zz")
set("n", "<C-u>", "<C-u>zz")

-- the next item while searching will always be in the center of the screen
set("n", "n", "nzzzv")
set("n", "N", "Nzzzv")

-- the text being overwritten by p will copy to the blackhole register "_"
set("x", "<leader>p", "\"_dP", { desc = "Paste w/o copying" })

-- use leader + y to copy to system clipboard
-- in normal mode, leader + y + motion to copy some text
-- in visual mode, leader + y to copy selected text
-- in normal mode, leader + Y to copy the whole line
set("n", "<leader>y", "\"+y", { desc = "Sys copy {motion}" })
set("v", "<leader>y", "\"+y", { desc = "Sys copy selected" })
set("n", "<leader>Y", "\"+Y", { desc = "Sys copy whole line" })

-- send the deleted text to the black hole register
set("n", "<leader>d", "\"_d", { desc = "Delete {motion} w/o copying" })
set("v", "<leader>d", "\"_d", { desc = "Delete selected w/o copying" })

-- ignore Q command (repeat last recorded register x times)
set("n", "Q", "<nop>")

-- format the current buffer using lsp
set("n", "<leader>f", function()
    vim.lsp.buf.format()
end, { desc = "Format buffer" })

-- rename all occurances of a text
set("n", "<leader>s", [[:%s/\<<C-r><C-w>\>/<C-r><C-w>/gI<Left><Left><Left>]]
, { desc = "Refactor cursor text" })

-- set the current file executable
set("n", "<leader>x", "<cmd>!chmod +x %<CR>", { desc = "Make file executatble", silent = true })

