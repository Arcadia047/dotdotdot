vim.g.disable_autoformat = true
vim.o.cmdheight= 0

local opt = vim.opt

-- show line number on the current line, and relative on others
opt.nu = true
opt.relativenumber = true

-- indentation related
opt.tabstop = 4
opt.softtabstop = 4
opt.shiftwidth = 4
opt.expandtab = true
opt.smartindent = true

-- don't wrap at the end of the line
opt.wrap = false

-- don't highlight the searched items
opt.hlsearch = false
opt.incsearch = true
opt.ignorecase = true
opt.smartcase = true

opt.termguicolors = true

-- use a column for potential signs so the beginning of each line aligns
opt.signcolumn = "yes"

-- always show at least 20 lines when scrolling up/down
opt.scrolloff = 20

-- mark the 80th column with color
opt.colorcolumn = "80"

-- split
opt.splitright = true
opt.splitbelow = true
