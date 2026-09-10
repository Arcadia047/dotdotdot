local repo = assert(vim.env.DOTDOTDOT_TEST_REPO)
local registry, packages, installed, installing = {}, {}, {}, {}
local refreshes, installs, notices = 0, 0, {}
local enabled, executable = {}, {}
local original_notify, original_executable = vim.notify, vim.fn.executable
local original_enable, original_is_enabled = vim.lsp.enable, vim.lsp.is_enabled
vim.notify = function(message)
	table.insert(notices, message)
end
vim.fn.executable = function(command)
	return executable[command] and 1 or 0
end
vim.lsp.enable = function(name)
	enabled[name] = true
end
vim.lsp.is_enabled = function(name)
	return enabled[name] or false
end
registry.is_installed = function(name)
	return installed[name] or false
end
registry.get_all_package_names = function()
	return { "clangd", "clang-format" }
end
registry.refresh = function(callback)
	refreshes = refreshes + 1
	vim.schedule(callback)
end
registry.get_package = function(name)
	if packages[name] then
		return packages[name]
	end
	local pkg = { handlers = {} }
	function pkg:is_installed()
		return installed[name] or false
	end
	function pkg:is_installing()
		return installing[name] or false
	end
	function pkg:on(event, callback)
		self.handlers[event] = callback
	end
	function pkg:off(event)
		self.handlers[event] = nil
	end
	function pkg:install()
		installs = installs + 1
		installing[name] = true
	end
	packages[name] = pkg
	return pkg
end
package.loaded["mason-registry"] = registry
package.loaded["mason-lspconfig.mappings"] = {
	get_mason_map = function()
		return { lspconfig_to_package = { clangd = "clangd" } }
	end,
}
local function pump()
	vim.wait(30, function()
		return false
	end, 1)
end
local function fresh()
	packages, installed, installing = {}, {}, {}
	refreshes, installs, notices, enabled, executable = 0, 0, {}, {}, {}
	return dofile(repo .. "/nvim/lua/config/tools.lua")
end
local function emit(name, success)
	installed[name], installing[name] = success, false
	if success then
		executable[name] = true
	end
	packages[name].handlers[success and "install:success" or "install:failed"]()
	pump()
end
local count = 0
local function check(name, fn)
	fn()
	count = count + 1
	print("PASS " .. name)
end
check("concurrent file requests share one installation and all callbacks complete", function()
	local tools, completed = fresh(), 0
	tools.install({ "clangd" }, function(ok)
		assert(ok)
		completed = completed + 1
	end)
	tools.install({ "clangd" }, function(ok)
		assert(ok)
		completed = completed + 1
	end)
	pump()
	assert(installs == 1 and refreshes == 1 and completed == 0)
	emit("clangd", true)
	assert(completed == 2 and packages.clangd.handlers["install:failed"] == nil)
end)
check("installed tools do not refresh or reinstall", function()
	local tools, completed = fresh(), false
	installed.clangd = true
	tools.install({ "clangd" }, function(ok)
		completed = ok
	end)
	assert(completed and installs == 0 and refreshes == 0)
end)
check("an installation already started by Mason is adopted", function()
	local tools, completed = fresh(), false
	installing.clangd = true
	tools.install({ "clangd" }, function(ok)
		completed = ok
	end)
	pump()
	assert(installs == 0)
	emit("clangd", true)
	assert(completed)
end)
check("failed installations report once without a retry loop", function()
	local tools, completed = fresh(), 0
	tools.install({ "clangd" }, function(ok)
		assert(not ok)
		completed = completed + 1
	end)
	pump()
	emit("clangd", false)
	tools.install({ "clangd" }, function(ok)
		assert(not ok)
		completed = completed + 1
	end)
	pump()
	assert(installs == 1 and completed == 2)
	assert(#vim.tbl_filter(function(s)
		return s:find("Could not install", 1, true)
	end, notices) == 1)
	assert(packages.clangd.handlers["install:success"] == nil)
end)
check("CUDA requests its server and formatter; server enables as soon as ready", function()
	local tools = fresh()
	vim.lsp.config("clangd", { cmd = { "clangd" }, filetypes = { "cuda" } })
	vim.api.nvim_buf_set_name(0, "/tmp/dotdotdot-tooling-fixture.cu")
	vim.bo.filetype = "cuda"
	tools.setup({ clangd = {} })
	pump()
	assert(installs == 2 and not enabled.clangd)
	emit("clangd", true)
	assert(enabled.clangd and not installed["clang-format"])
	emit("clang-format", false)
	vim.cmd.ToolingInstall()
	pump()
	assert(installs == 3, "manual retry did not restart the failed formatter")
	emit("clang-format", true)
end)
vim.notify, vim.fn.executable = original_notify, original_executable
vim.lsp.enable, vim.lsp.is_enabled = original_enable, original_is_enabled
print(count .. " tooling checks passed")
