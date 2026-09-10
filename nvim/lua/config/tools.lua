-- Install only the tools selected by this configuration for an opened filetype.
-- Project configuration still decides which formatter/linter is allowed to run.
local M = {}
local servers = {}
local jobs = {}
local registry_waiters
local extra = {
	python = { "ruff" },
	go = { "goimports", "gofumpt" },
	javascript = { "prettier", "biome" },
	javascriptreact = { "prettier", "biome" },
	typescript = { "prettier", "biome" },
	typescriptreact = { "prettier", "biome" },
	json = { "prettier", "biome" },
	jsonc = { "prettier", "biome" },
	html = { "prettier" },
	css = { "prettier" },
	scss = { "prettier" },
	yaml = { "prettier" },
	markdown = { "prettier" },
	lua = { "stylua" },
	sh = { "shfmt", "shellcheck" },
	bash = { "shfmt", "shellcheck" },
	c = { "clang-format" },
	cpp = { "clang-format" },
	objc = { "clang-format" },
	objcpp = { "clang-format" },
	cuda = { "clang-format" },
	java = { "jdtls", "java-debug-adapter", "google-java-format" },
	kotlin = { "ktlint", "detekt" },
	sql = { "sqlfluff" },
	toml = { "taplo" },
	terraform = { "tflint" },
	["terraform-vars"] = { "tflint" },
}

local function notify(message, level)
	vim.schedule(function()
		vim.notify(message, level or vim.log.levels.INFO, { title = "Language tools" })
	end)
end

local function refresh(callback)
	if registry_waiters then
		table.insert(registry_waiters, callback)
		return
	end
	registry_waiters = { callback }
	require("mason-registry").refresh(function()
		vim.schedule(function()
			local callbacks = registry_waiters
			registry_waiters = nil
			-- An offline refresh can still leave a usable cached registry.
			for _, fn in ipairs(callbacks) do
				fn()
			end
		end)
	end)
end

function M.install(names, callback)
	callback = callback or function() end
	if #names == 0 then
		callback(true)
		return
	end
	local remaining, success = #names, true
	local function complete(ok)
		success = success and ok
		remaining = remaining - 1
		if remaining == 0 then
			callback(success)
		end
	end
	local registry = require("mason-registry")
	for _, name in ipairs(names) do
		if registry.is_installed(name) then
			complete(true)
		elseif jobs[name] and jobs[name].failed then
			complete(false)
		elseif jobs[name] then
			table.insert(jobs[name].callbacks, complete)
		else
			jobs[name] = { callbacks = { complete } }
			refresh(function()
				local function finish(ok)
					local job = jobs[name]
					if not job or job.failed then
						return
					end
					if ok then
						jobs[name] = nil
					else
						jobs[name] = { failed = true }
					end
					if not ok then
						notify(
							"Could not install " .. name .. ". See :MasonLog; :ToolingInstall retries.",
							vim.log.levels.ERROR
						)
					end
					for _, fn in ipairs(job.callbacks) do
						fn(ok)
					end
				end
				local ok, pkg = pcall(registry.get_package, name)
				if not ok then
					finish(false)
					return
				end
				if pkg:is_installed() then
					finish(true)
					return
				end
				local on_success, on_failure
				local function done(installed)
					pkg:off("install:success", on_success)
					pkg:off("install:failed", on_failure)
					vim.schedule(function()
						finish(installed)
					end)
				end
				on_success = function()
					done(true)
				end
				on_failure = function()
					done(false)
				end
				pkg:on("install:success", on_success)
				pkg:on("install:failed", on_failure)
				if not pkg:is_installing() then
					notify("Installing " .. name .. "…")
					local started = pcall(pkg.install, pkg)
					if not started then
						done(false)
					end
				end
			end)
		end
	end
end

-- Metals uses the existing pinned Coursier bootstrap/cache, rather than a
-- second Mason installation. Java and Coursier remain machine prerequisites.
function M.metals(version, callback)
	local directory = vim.fn.stdpath("cache") .. "/nvim-metals"
	local path = directory .. "/metals"
	if vim.fn.executable(path) == 1 then
		callback(true)
		return
	end
	local name = "@metals"
	if jobs[name] then
		if jobs[name].failed then
			callback(false)
		else
			table.insert(jobs[name].callbacks, callback)
		end
		return
	end
	jobs[name] = { callbacks = { callback } }
	local function finish(ok)
		local callbacks = jobs[name].callbacks
		if ok then
			jobs[name] = nil
		else
			jobs[name] = { failed = true }
		end
		for _, fn in ipairs(callbacks) do
			fn(ok)
		end
	end
	local coursier = vim.fn.executable("coursier") == 1 and "coursier" or "cs"
	if vim.fn.executable(coursier) == 0 or vim.fn.executable("java") == 0 then
		notify("Metals needs Java and Coursier. Run bootstrap, then :ToolingInstall to retry.", vim.log.levels.ERROR)
		finish(false)
		return
	end
	vim.fn.mkdir(directory, "p")
	local temporary = path .. "." .. vim.fn.getpid() .. ".tmp"
	notify("Installing Metals " .. version .. "…")
	vim.system({
		coursier,
		"bootstrap",
		"--java-opt",
		"-Xss4m",
		"--java-opt",
		"-Xms100m",
		"org.scalameta:metals_2.13:" .. version,
		"-o",
		temporary,
		"-f",
	}, { text = true }, function(result)
		vim.schedule(function()
			local ok = result.code == 0 and vim.uv.fs_rename(temporary, path) ~= nil
			if ok then
				vim.fn.writefile({ version }, directory .. "/.version")
			else
				vim.uv.fs_unlink(temporary)
				notify(
					"Metals installation failed; :ToolingInstall retries. " .. (result.stderr or ""),
					vim.log.levels.ERROR
				)
			end
			finish(ok)
		end)
	end)
end

function M.requirements(bufnr)
	local ft = vim.bo[bufnr].filetype
	local packages, names = {}, {}
	local mapping = require("mason-lspconfig.mappings").get_mason_map().lspconfig_to_package
	for name in pairs(servers) do
		local config = vim.lsp.config[name]
		if config and vim.tbl_contains(config.filetypes or {}, ft) then
			table.insert(names, name)
			if type(config.cmd) == "table" and vim.fn.executable(config.cmd[1]) == 0 and mapping[name] then
				packages[mapping[name]] = true
			end
		end
	end
	for _, name in ipairs(extra[ft] or {}) do
		-- Tools already provided by the machine or project need no second copy.
		if vim.fn.executable(name) == 0 and not require("mason-registry").is_installed(name) then
			packages[name] = true
		end
	end
	local result = vim.tbl_keys(packages)
	table.sort(result)
	return result, names
end

function M.ensure(bufnr)
	if not vim.api.nvim_buf_is_valid(bufnr) or vim.bo[bufnr].buftype ~= "" or vim.bo[bufnr].filetype == "" then
		return
	end
	local ft = vim.bo[bufnr].filetype
	local supported = extra[ft] ~= nil
	for name in pairs(servers) do
		if vim.tbl_contains(vim.lsp.config[name].filetypes or {}, ft) then
			supported = true
			break
		end
	end
	if not supported then
		return
	end
	local function ensure()
		if not vim.api.nvim_buf_is_valid(bufnr) then
			return
		end
		local packages, names = M.requirements(bufnr)
		-- Enable each available server independently of unrelated tool failures.
		local function enable_ready()
			for _, name in ipairs(names) do
				local cmd = vim.lsp.config[name].cmd
				if type(cmd) == "table" and vim.fn.executable(cmd[1]) == 1 and not vim.lsp.is_enabled(name) then
					vim.lsp.enable(name)
				end
			end
		end
		enable_ready()
		for _, package in ipairs(packages) do
			M.install({ package }, enable_ready)
		end
	end
	if #require("mason-registry").get_all_package_names() == 0 then
		refresh(ensure)
	else
		ensure()
	end
end

function M.setup(configured_servers)
	servers = configured_servers
	vim.api.nvim_create_autocmd({ "FileType", "BufEnter" }, {
		group = vim.api.nvim_create_augroup("UserLanguageTools", { clear = true }),
		callback = function(args)
			vim.schedule(function()
				M.ensure(args.buf)
			end)
		end,
	})
	vim.api.nvim_create_user_command("ToolingInstall", function()
		for name, job in pairs(jobs) do
			if job.failed then
				jobs[name] = nil
			end
		end
		M.ensure(vim.api.nvim_get_current_buf())
		vim.api.nvim_exec_autocmds("User", { pattern = "LanguageToolsRetry" })
	end, { desc = "Install/retry language tools for the current filetype" })
	vim.api.nvim_create_user_command("ToolingInfo", function()
		local packages, names = M.requirements(0)
		local clients = vim.tbl_map(function(c)
			return c.name
		end, vim.lsp.get_clients({ bufnr = 0 }))
		vim.notify(table.concat({
			"Filetype: " .. vim.bo.filetype,
			"Configured LSP: " .. table.concat(names, ", "),
			"Attached LSP: " .. table.concat(clients, ", "),
			"Missing tools: " .. table.concat(packages, ", "),
			"Use :MasonLog, :LspInfo, or :ConformInfo for details.",
		}, "\n"))
	end, { desc = "Show language tooling for this buffer" })
	for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
		if vim.api.nvim_buf_is_loaded(bufnr) then
			vim.schedule(function()
				M.ensure(bufnr)
			end)
		end
	end
end

return M
