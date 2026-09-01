vim.g.have_nerd_font = true

vim.opt.hlsearch = true
vim.opt.incsearch = true
vim.opt.termguicolors = true
vim.opt.number = true
vim.opt.relativenumber = true
-- Fallback; autocmds.lua rescales this to ~30% of each window's height.
vim.opt.scrolloff = 8
vim.opt.sidescrolloff = 8
vim.opt.signcolumn = "yes"
vim.opt.wrap = false
vim.opt.linebreak = true
vim.opt.expandtab = true
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.softtabstop = 2
vim.opt.smartindent = true
vim.opt.undofile = true
vim.opt.undolevels = 10000
-- Persistent undo covers recovery; in-memory swap files only add noise files.
vim.opt.swapfile = false
-- Restore the view (folds, cursor position) when jumping through the tag stack.
vim.opt.jumpoptions = "view"
-- Allow cursor past the edge only in visual block mode, for column edits.
vim.opt.virtualedit = "block"
-- Use ripgrep for :grep when available.
if vim.fn.executable("rg") == 1 then
	vim.opt.grepprg = "rg --vimgrep --hidden --glob '!.git'"
	vim.opt.grepformat = "%f:%l:%c:%m"
end
-- One statusline across the whole tab page, including splits.
vim.opt.laststatus = 3
-- Better built-in diffs: vertical, patience algorithm, aligned matching lines.
-- Better built-in diffs: vertical, patience algorithm, indent-heuristic.
-- (Neovim's default diffopt already includes linematch:40.)
vim.opt.diffopt:append({ "vertical", "algorithm:patience", "indent-heuristic" })
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.splitbelow = true
vim.opt.splitright = true
vim.opt.splitkeep = "screen"
vim.opt.updatetime = 250
vim.opt.timeoutlen = 300
vim.opt.completeopt = { "menu", "menuone", "noselect" }
vim.opt.inccommand = "split"
vim.opt.confirm = true
vim.opt.mouse = "a"
vim.opt.clipboard = "unnamedplus"
vim.opt.cursorline = true
vim.opt.list = true
vim.opt.listchars = { tab = "» ", trail = "·", nbsp = "␣" }
vim.opt.pumheight = 12
vim.opt.winborder = "rounded"
vim.opt.sessionoptions = {
	"buffers",
	"curdir",
	"folds",
	"help",
	"tabpages",
	"winsize",
	"winpos",
}
vim.opt.shortmess:append({ I = true })
