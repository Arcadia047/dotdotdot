return {
    "nvim-treesitter/nvim-treesitter",
    event = { "BufReadPre", "BufNewFile" },
    build = function()
    require("nvim-treesitter.install").update({ with_sync = true })()
    end,
    dependencies = {
    "windwp/nvim-ts-autotag",
    },
    config = function()
    -- import nvim-treesitter plugin
    local treesitter = require("nvim-treesitter.configs")

    -- configure treesitter
    treesitter.setup({ 
    -- enable syntax highlighting
    highlight = { enable = true },
    -- enable indentation
    indent = { enable = true },
    -- enable autotagging (w/ nvim-ts-autotag plugin)
    autotag = {
    enable = true,
    },
    auto_install = true,
    -- ensure these language parsers are installed
    ensure_installed = {
    "markdown",
    "markdown_inline",
    "bash",
    "lua",
    "vim",
    "gitignore",
    "vimdoc",
    "c",
    }
    })
    end,
}
