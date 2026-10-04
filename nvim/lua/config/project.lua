-- One project boundary for completion and saving before execution.
local M = {}
local markers = {
	".git",
	"pyproject.toml",
	"go.work",
	"go.mod",
	"package.json",
	"pom.xml",
	"settings.gradle",
	"settings.gradle.kts",
	"build.gradle",
	"build.gradle.kts",
	"build.sbt",
	"build.sc",
	"Makefile",
	"CMakeLists.txt",
}

function M.root(bufnr)
	local name = vim.api.nvim_buf_get_name(bufnr)
	if name == "" then
		return nil
	end
	-- Group markers at equal priority so a nested package beats a distant .git.
	return vim.fs.root(bufnr, { markers }) or vim.fs.dirname(name)
end

function M.buffers(bufnr)
	local root = M.root(bufnr)
	return vim.tbl_filter(function(buf)
		return root ~= nil
			and vim.api.nvim_buf_is_loaded(buf)
			and vim.bo[buf].buflisted
			and vim.bo[buf].buftype == ""
			and M.root(buf) == root
	end, vim.api.nvim_list_bufs())
end

function M.save(bufnr)
	-- Native :write preserves undo history and runs each file's formatting hooks.
	-- Any write failure aborts execution rather than running a partial refactor.
	for _, buf in ipairs(M.buffers(bufnr)) do
		if vim.bo[buf].modified then
			vim.api.nvim_buf_call(buf, function()
				vim.cmd("silent write")
			end)
		end
	end
end

return M
