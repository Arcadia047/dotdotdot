local repo = assert(vim.env.DOTDOTDOT_TEST_REPO)
package.path = repo .. "/nvim/lua/?.lua;" .. package.path
local project = require("config.project")
local root = vim.fn.stdpath("cache") .. "/project-test"
vim.fn.mkdir(root .. "/one/.git", "p")
vim.fn.mkdir(root .. "/two/.git", "p")
vim.fn.mkdir(root .. "/one/web", "p")
vim.fn.writefile({ "{}" }, root .. "/one/web/package.json")
local function buffer(path, text)
	vim.fn.writefile({ text }, path)
	local buf = vim.fn.bufadd(path)
	vim.fn.bufload(buf)
	vim.bo[buf].buflisted = true
	vim.api.nvim_buf_set_lines(buf, 0, -1, false, { text .. " edited" })
	return buf
end
local main = buffer(root .. "/one/main.py", "main")
local helper = buffer(root .. "/one/helper.py", "helper")
local foreign = buffer(root .. "/two/foreign.py", "foreign")
local nested = buffer(root .. "/one/web/main.ts", "nested")
local scratch = buffer(root .. "/one/output.txt", "output")
vim.bo[scratch].buftype = "nofile"
local buffers = project.buffers(main)
assert(vim.tbl_contains(buffers, helper), "Hidden project buffer excluded")
assert(not vim.tbl_contains(buffers, foreign), "Unrelated project included")
assert(not vim.tbl_contains(buffers, nested), "Nested package crossed its boundary")
assert(not vim.tbl_contains(buffers, scratch), "Tool panel included")
print("PASS native project boundaries include hidden files and exclude nested/unrelated contexts")
project.save(main)
assert(vim.fn.readfile(root .. "/one/helper.py")[1] == "helper edited")
assert(not vim.bo[main].modified and not vim.bo[helper].modified)
assert(vim.fn.readfile(root .. "/two/foreign.py")[1] == "foreign" and vim.bo[foreign].modified)
assert(vim.fn.readfile(root .. "/one/web/main.ts")[1] == "nested" and vim.bo[nested].modified)
print("PASS project save persists refactors and preserves unrelated pending edits")
vim.api.nvim_buf_set_lines(helper, 0, -1, false, { "unsaved" })
vim.bo[helper].readonly = true
assert(not pcall(project.save, main), "Write failure was swallowed")
assert(vim.bo[helper].modified, "Failed write lost pending edits")
print("PASS failed project writes propagate to stop execution")
