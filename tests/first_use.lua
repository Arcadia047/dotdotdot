local tools = require("config.tools")
local buf = vim.api.nvim_get_current_buf()
assert(vim.bo.filetype == "lua")
assert(
	vim.wait(240000, function()
		return #vim.lsp.get_clients({ bufnr = buf, name = "lua_ls" }) > 0
			and vim.fn.executable("stylua") == 1
			and vim.treesitter.highlighter.active[buf] ~= nil
	end, 100),
	"first-file installation/attachment did not finish: " .. vim.api.nvim_exec2("messages", { output = true }).output
)
local c = vim.lsp.get_clients({ bufnr = buf, name = "lua_ls" })[1]
assert(vim.wait(10000, function()
	return c.initialized
end, 50))
local r = c:request_sync(
	"textDocument/hover",
	{ textDocument = { uri = vim.uri_from_bufnr(buf) }, position = { line = 1, character = 9 } },
	10000,
	buf
)
assert(r and not r.err and r.result, vim.inspect(r))
require("conform").format({ bufnr = buf, async = false, lsp_format = "never", timeout_ms = 10000 })
assert(
	vim.api.nvim_buf_get_lines(buf, 0, 1, false)[1] == "local answer = 42",
	"formatter did not format first opened file"
)
assert(vim.fn.maparg(" bd", "n", false, true).desc == "Close Current Buffer")
print("PASS first Lua file installed lua_ls and StyLua; attached without reopening; hover and formatting worked")
vim.cmd.edit(vim.fn.fnamemodify(vim.api.nvim_buf_get_name(buf), ":h") .. "/kernel.cu")
local buf = vim.api.nvim_get_current_buf()
assert(vim.bo.filetype == "cuda")
assert(vim.filetype.match({ filename = "kernel.cuh" }) == "cuda")
assert(
	vim.wait(240000, function()
		return #vim.lsp.get_clients({ bufnr = buf, name = "clangd" }) > 0
			and vim.fn.executable("clang-format") == 1
			and vim.treesitter.highlighter.active[buf] ~= nil
	end, 100),
	"CUDA tools did not become ready: " .. vim.api.nvim_exec2("messages", { output = true }).output
)
local c = vim.lsp.get_clients({ bufnr = buf, name = "clangd" })[1]
assert(vim.wait(10000, function()
	return c.initialized
end, 50))
local r = c:request_sync(
	"textDocument/hover",
	{ textDocument = { uri = vim.uri_from_bufnr(buf) }, position = { line = 0, character = 5 } },
	10000,
	buf
)
assert(r and r.result and not r.err, vim.inspect(r))
require("conform").format({ bufnr = buf, async = false, lsp_format = "never", timeout_ms = 10000 })
assert(
	vim.api.nvim_buf_get_lines(buf, 0, 1, false)[1]:find("int add(int a, int b)", 1, true),
	"CUDA formatter was not used"
)
assert(vim.fn.maparg(" bd", "n", false, true).desc == "Close Current Buffer")
print("PASS CUDA detection, clangd hover, clang-format, C++ parser, and close-buffer label")
vim.cmd("qa!")
