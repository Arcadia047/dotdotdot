local function find_up(bufnr, names)
	local name = vim.api.nvim_buf_get_name(bufnr)
	if name == "" then
		return nil
	end
	return vim.fs.find(names, { path = vim.fs.dirname(name), upward = true })[1]
end

local prettier_configs = {
	".prettierrc",
	".prettierrc.json",
	".prettierrc.json5",
	".prettierrc.yaml",
	".prettierrc.yml",
	".prettierrc.toml",
	".prettierrc.js",
	".prettierrc.cjs",
	".prettierrc.mjs",
	"prettier.config.js",
	"prettier.config.cjs",
	"prettier.config.mjs",
	"prettier.config.ts",
}

local function has_prettier(bufnr)
	if find_up(bufnr, prettier_configs) then
		return true
	end
	local package_file = find_up(bufnr, { "package.json" })
	if not package_file then
		return false
	end
	local ok, package = pcall(vim.json.decode, table.concat(vim.fn.readfile(package_file), "\n"))
	if not ok then
		return false
	end
	return package.prettier ~= nil
		or (package.dependencies and package.dependencies.prettier ~= nil)
		or (package.devDependencies and package.devDependencies.prettier ~= nil)
end

local function web_formatters(bufnr)
	if find_up(bufnr, { "biome.json", "biome.jsonc" }) then
		return { "biome-check" }
	end
	return { "prettier", stop_after_first = true }
end

local function sql_is_configured(bufnr)
	if find_up(bufnr, { ".sqlfluff" }) then
		return true
	end
	local config = find_up(bufnr, { "pyproject.toml", "setup.cfg", "tox.ini" })
	return config ~= nil and table.concat(vim.fn.readfile(config), "\n"):find("sqlfluff", 1, true) ~= nil
end

local function file_contains(path, needle)
	if not path then
		return false
	end
	return table.concat(vim.fn.readfile(path), "\n"):find(needle, 1, true) ~= nil
end

local function java_formatters(bufnr)
	for _, name in ipairs({ "pom.xml", "build.gradle", "build.gradle.kts" }) do
		local build_file = find_up(bufnr, { name })
		if file_contains(build_file, "google-java-format") or file_contains(build_file, "googleJavaFormat") then
			return { "google-java-format" }
		end
	end
	-- jdtls is the fallback and can honor project-specific Eclipse formatting settings.
	return {}
end

local function autoformat_allowed(bufnr)
	local ft = vim.bo[bufnr].filetype
	if
		vim.tbl_contains({
			"javascript",
			"javascriptreact",
			"typescript",
			"typescriptreact",
			"json",
			"jsonc",
			"html",
			"css",
			"scss",
			"yaml",
		}, ft)
	then
		return find_up(bufnr, { "biome.json", "biome.jsonc" }) ~= nil or has_prettier(bufnr)
	elseif ft == "markdown" then
		return has_prettier(bufnr)
	elseif ft == "c" or ft == "cpp" then
		return find_up(bufnr, { ".clang-format", "_clang-format" }) ~= nil
	elseif ft == "lua" then
		return find_up(bufnr, { ".stylua.toml", "stylua.toml" }) ~= nil
	elseif ft == "sh" or ft == "bash" then
		return find_up(bufnr, { ".editorconfig" }) ~= nil
	elseif ft == "sql" then
		return sql_is_configured(bufnr)
	elseif ft == "python" then
		return find_up(bufnr, { "pyproject.toml", "ruff.toml", ".ruff.toml" }) ~= nil
	elseif ft == "go" then
		return find_up(bufnr, { "go.mod", "go.work" }) ~= nil
	elseif ft == "java" then
		return find_up(bufnr, { "pom.xml", "build.gradle", "build.gradle.kts" }) ~= nil
	elseif ft == "scala" or ft == "sbt" then
		return find_up(bufnr, { "build.sbt", "build.sc", ".scalafmt.conf", ".scala-build" }) ~= nil
	end
	return false
end

return {
	{
		"stevearc/conform.nvim",
		event = { "BufWritePre" },
		cmd = { "ConformInfo" },
		keys = {
			{
				"<leader>cf",
				function()
					require("conform").format({ async = true, lsp_format = "fallback" })
				end,
				desc = "Format Buffer",
			},
		},
		opts = {
			notify_on_error = true,
			formatters = {
				ruff_fix = { append_args = { "--no-unsafe-fixes" } },
			},
			format_on_save = function(bufnr)
				if vim.bo[bufnr].buftype ~= "" or not autoformat_allowed(bufnr) then
					return
				end
				return { timeout_ms = 2000, lsp_format = "fallback" }
			end,
			formatters_by_ft = {
				python = { "ruff_fix", "ruff_organize_imports", "ruff_format" },
				go = { "goimports", "gofumpt" },
				javascript = web_formatters,
				javascriptreact = web_formatters,
				typescript = web_formatters,
				typescriptreact = web_formatters,
				json = web_formatters,
				jsonc = web_formatters,
				html = web_formatters,
				css = web_formatters,
				scss = web_formatters,
				yaml = web_formatters,
				markdown = { "prettier", stop_after_first = true },
				lua = { "stylua" },
				sh = { "shfmt" },
				bash = { "shfmt" },
				c = { "clang_format" },
				cpp = { "clang_format" },
				java = java_formatters,
				sql = { "sqlfluff" },
			},
		},
	},
	{
		"mfussenegger/nvim-lint",
		event = { "BufReadPost", "BufWritePost", "InsertLeave" },
		config = function()
			local lint = require("lint")
			lint.linters_by_ft = { sql = { "sqlfluff" } }
			vim.api.nvim_create_autocmd({ "BufWritePost", "InsertLeave" }, {
				group = vim.api.nvim_create_augroup("UserSqlLint", { clear = true }),
				callback = function(args)
					if vim.bo[args.buf].filetype == "sql" and sql_is_configured(args.buf) then
						lint.try_lint(nil, {
							cwd = vim.fs.dirname(
								find_up(args.buf, { ".sqlfluff", "pyproject.toml", "setup.cfg", "tox.ini" })
							),
						})
					end
				end,
			})
		end,
	},
}
