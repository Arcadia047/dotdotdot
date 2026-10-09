local repo = assert(vim.env.DOTDOTDOT_TEST_REPO)
package.path = repo .. "/nvim/lua/?.lua;" .. package.path
vim.g.mapleader = " "
-- Exercise real commands with an in-memory provider; never read/write macOS.
local copied = { { "" }, "v" }
local reads, writes = 0, 0
vim.g.clipboard = {
	name = "Disposable register check",
	copy = {
		["+"] = function(lines, kind)
			writes = writes + 1
			copied = { vim.deepcopy(lines), kind }
		end,
		["*"] = function()
			error("Unexpected primary selection write")
		end,
	},
	paste = {
		["+"] = function()
			reads = reads + 1
			return vim.deepcopy(copied)
		end,
		["*"] = function()
			error("Unexpected primary selection read")
		end,
	},
	cache_enabled = 0,
}
require("config.options")
require("config.keymaps")

local function keys(value)
	vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(value, true, false, true), "xt", false)
end
local function fixture(lines)
	vim.cmd("enew!")
	vim.bo.swapfile = false
	vim.api.nvim_buf_set_lines(0, 0, -1, false, lines)
	vim.api.nvim_win_set_cursor(0, { 1, 0 })
	vim.fn.setreg("+", "system copy", "v")
	vim.fn.setreg('"', "local copy", "v")
	reads, writes = 0, 0
end
local function local_only(label)
	assert(reads == 0 and writes == 0, label .. " accessed the system clipboard")
	assert(vim.deep_equal(copied, { { "system copy" }, "v" }), label .. " overwrote clipboard")
end
local function contents(expected)
	local actual = vim.api.nvim_buf_get_lines(0, 0, -1, false)
	assert(vim.deep_equal(actual, expected), vim.inspect(actual) .. " != " .. vim.inspect(expected))
end

assert(vim.o.clipboard == "", "Implicit clipboard sharing is enabled")
fixture({ "source", "discard", "tail" })
keys("yyjddp")
contents({ "source", "tail", "discard" })
assert(vim.fn.getreg("0") == "source\n", "yank register zero was lost")
assert(vim.fn.getreg("1") == "discard\n", "delete history was lost")
local_only("local yank, delete and paste")
print("PASS ordinary yank, delete and paste use local registers and retain history")

for _, edit in ipairs({ "d", "D", "c", "C", "x", "X", "s", "S" }) do
	fixture({ "first word", "second line" })
	local sequence = edit == "d" and "dw" or edit == "c" and "cwnew<Esc>" or edit
	if edit == "C" or edit == "s" or edit == "S" then
		sequence = edit .. "new<Esc>"
	elseif edit == "X" then
		sequence = "lX"
	end
	keys(sequence)
	assert(vim.fn.getreg('"') ~= "local copy", edit .. " discarded removed text")
	local_only(edit)
end
print("PASS all ordinary delete/change/character edits save text locally")

fixture({ "first(a, b)", "second()" })
keys("f(di(j0f(p")
contents({ "first()", "second(a, b)" })
local_only("moving function arguments")
print("PASS di( then p moves function arguments without clipboard access")

fixture({ "one", "two", "three", "four", "five" })
keys("2dd.")
contents({ "five" })
local_only("count and repeat")
keys("u")
contents({ "three", "four", "five" })
print("PASS counts, dot repeat and undo retain native edit behavior")

for _, edit in ipairs({ "d", "c" }) do
	fixture({ "first second" })
	keys("viw" .. edit .. (edit == "c" and "new<Esc>" or ""))
	assert(vim.fn.getreg('"') == "first", "visual " .. edit .. " discarded removed text")
	local_only("visual " .. edit)
end
for _, paste in ipairs({ "p", "P" }) do
	fixture({ "first", "second" })
	keys("viw" .. paste .. "jviw" .. paste)
	contents({ "local copy", "local copy" })
	assert(vim.fn.getreg('"') == "local copy", "visual paste overwrote its source")
	local_only("repeated visual " .. paste)
end
print("PASS visual cuts stay local and repeated visual paste preserves the source")

fixture({ "source", "discard", "tail" })
keys(" yyjdd p")
contents({ "source", "tail", "source" })
assert(vim.deep_equal(copied, { { "source", "" }, "V" }), "clipboard copy was lost after deletion")
assert(writes == 1 and reads > 0, "leader copy/paste did not use the clipboard provider")
print("PASS Space yy copies a line and Space p retains it across deletion")

fixture({ "first second", "replace", "again" })
keys("viw yjviw pjviw p")
contents({ "first second", "first", "first" })
assert(vim.deep_equal(copied, { { "first" }, "v" }), "visual clipboard paste overwrote its source")
assert(writes == 1, "visual replacement copied the removed text to the clipboard")
print("PASS visual Space y and repeated Space p preserve clipboard contents")

fixture({ "source", "target", "again" })
keys("V yjV pjV p")
contents({ "source", "source", "source" })
assert(vim.deep_equal(copied, { { "source", "" }, "V" }) and writes == 1, "Linewise replacement changed clipboard")
fixture({ "ab12", "cd34", "xx56", "yy78" })
keys("<C-v>jl yjj0<C-v>jl p")
contents({ "ab12", "cd34", "ab56", "cd78" })
assert(vim.deep_equal(copied, { { "ab", "cd", "" }, "b" }) and writes == 1, "Blockwise replacement changed clipboard")
print("PASS clipboard copy/paste retains linewise and rectangular selection types")

fixture({ "first second" })
keys(" yiw")
assert(vim.deep_equal(copied, { { "first" }, "v" }), "Space y did not accept a text object")
fixture({ "one", "two", "keep" })
keys("2 yy")
assert(vim.deep_equal(copied, { { "one", "two", "" }, "V" }), "counted Space yy failed")
fixture({ "one", "two", "keep" })
keys(" y2y")
assert(vim.deep_equal(copied, { { "one", "two", "" }, "V" }), "Space y with operator count failed")
print("PASS clipboard yank supports motions, text objects and counts")

fixture({ "source", "target" })
keys(" yy")
copied = { { "external change" }, "v" }
reads, writes = 0, 0
keys("jp")
contents({ "source", "target", "source" })
assert(reads == 0 and writes == 0, "Ordinary paste queried clipboard after an explicit clipboard yank")
print("PASS ordinary paste stays local even after explicit clipboard copy")

fixture({ "original" })
keys(" p")
contents({ "osystem copyriginal" })
assert(writes == 0, "clipboard paste wrote to the clipboard")
fixture({ "original" })
keys("p")
contents({ "olocal copyriginal" })
local_only("ordinary paste with a different clipboard")
fixture({ "original" })
keys("P")
contents({ "local copyoriginal" })
local_only("ordinary paste before cursor")
print("PASS system paste reads external contents while ordinary p/P stay local")

fixture({ "cut this", "keep" })
keys('"add')
assert(vim.fn.getreg("a") == "cut this\n", "named-register cut was discarded")
local_only("named cut")
fixture({ "one", "two", "keep" })
keys('"+2dd')
assert(vim.deep_equal(copied, { { "one", "two", "" }, "V" }), "explicit clipboard cut was discarded")
contents({ "keep" })
fixture({ "replace me" })
vim.fn.setreg("a", "named source", "v")
keys('viw"ap')
contents({ "named source me" })
assert(vim.fn.getreg("a") == "named source")
local_only("named visual replacement")
print("PASS native explicit register commands remain available")
