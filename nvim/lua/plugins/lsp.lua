local java = require("config.java")

local servers = {
	lua_ls = {},
	pyright = {
		settings = {
			python = {
				analysis = {
					autoImportCompletions = true,
					diagnosticMode = "workspace",
					typeCheckingMode = "basic",
				},
			},
		},
	},
	ruff = {
		init_options = { settings = { logLevel = "error" } },
		on_attach = function(client)
			-- Pyright supplies richer documentation; Ruff remains the fast linter/fixer.
			client.server_capabilities.hoverProvider = false
		end,
	},
	gopls = {
		filetypes = { "go", "gomod", "gowork", "gosum" },
		settings = {
			gopls = {
				completeUnimported = true,
				gofumpt = true,
				staticcheck = true,
				usePlaceholders = true,
				hints = {
					assignVariableTypes = true,
					compositeLiteralFields = true,
					compositeLiteralTypes = true,
					constantValues = true,
					functionTypeParameters = true,
					parameterNames = true,
					rangeVariableTypes = true,
				},
			},
		},
	},
	vtsls = {
		settings = {
			complete_function_calls = true,
			vtsls = {
				autoUseWorkspaceTsdk = true,
				experimental = { completion = { enableServerSideFuzzyMatch = true } },
			},
			typescript = {
				updateImportsOnFileMove = { enabled = "always" },
				suggest = { completeFunctionCalls = true },
				inlayHints = {
					enumMemberValues = { enabled = true },
					functionLikeReturnTypes = { enabled = true },
					parameterNames = { enabled = "literals" },
					parameterTypes = { enabled = true },
					propertyDeclarationTypes = { enabled = true },
					variableTypes = { enabled = false },
				},
			},
			javascript = {
				updateImportsOnFileMove = { enabled = "always" },
				suggest = { completeFunctionCalls = true },
			},
		},
	},
	biome = {},
	eslint = {
		settings = { codeActionOnSave = { enable = true, mode = "problems" } },
		on_attach = function(client, bufnr)
			local group = vim.api.nvim_create_augroup("UserEslintFixAll", { clear = false })
			vim.api.nvim_clear_autocmds({ group = group, buffer = bufnr })
			vim.api.nvim_create_autocmd("BufWritePre", {
				group = group,
				buffer = bufnr,
				desc = "Apply ESLint-declared fixes before formatting",
				callback = function()
					if client:is_stopped() then
						return
					end
					client:request_sync("workspace/executeCommand", {
						command = "eslint.applyAllFixes",
						arguments = {
							{
								uri = vim.uri_from_bufnr(bufnr),
								version = vim.lsp.util.buf_versions[bufnr],
							},
						},
					}, 2000, bufnr)
				end,
			})
		end,
	},
	html = {},
	cssls = {},
	tailwindcss = {
		filetypes = { "html", "css", "scss", "javascript", "javascriptreact", "typescript", "typescriptreact" },
	},
	emmet_language_server = {
		filetypes = { "html", "css", "scss", "javascriptreact", "typescriptreact" },
	},
	bashls = {},
	jsonls = {},
	yamlls = {
		filetypes = { "yaml" },
		settings = { yaml = { validate = true, completion = true, hover = true } },
	},
	taplo = {},
	marksman = { filetypes = { "markdown" } },
	terraformls = {},
	kotlin_lsp = {},
	clangd = {
		filetypes = { "c", "cpp", "objc", "objcpp", "cuda", "proto" },
		cmd = {
			"clangd",
			"--background-index",
			"--clang-tidy",
			"--header-insertion=iwyu",
			"--completion-style=detailed",
			"--function-arg-placeholders=true",
		},
		init_options = { clangdFileStatus = true },
	},
}

local mason_tools = {
	"bash-language-server",
	"biome",
	"codelldb",
	"clang-format",
	"clangd",
	"css-lsp",
	"debugpy",
	"detekt",
	"delve",
	"emmet-language-server",
	"eslint-lsp",
	"gofumpt",
	"goimports",
	"google-java-format",
	"gopls",
	"html-lsp",
	"jdtls",
	"java-debug-adapter",
	"js-debug-adapter",
	"json-lsp",
	"kotlin-debug-adapter",
	"kotlin-lsp",
	"ktlint",
	"lua-language-server",
	"marksman",
	"prettier",
	"pyright",
	"ruff",
	"shfmt",
	"sqlfluff",
	"stylua",
	"tailwindcss-language-server",
	"taplo",
	"terraform-ls",
	"tflint",
	"tree-sitter-cli",
	"vtsls",
	"yaml-language-server",
}

local function apply_code_action(kind)
	vim.lsp.buf.code_action({
		apply = true,
		context = { only = { kind }, diagnostics = vim.diagnostic.get(0) },
	})
end

local function lsp_attach(args)
	local client = vim.lsp.get_client_by_id(args.data.client_id)
	local function map(mode, lhs, rhs, desc)
		vim.keymap.set(mode, lhs, rhs, { buffer = args.buf, desc = desc })
	end

	map("n", "gd", vim.lsp.buf.definition, "Goto Definition")
	map("n", "gD", vim.lsp.buf.declaration, "Goto Declaration")
	map("n", "K", vim.lsp.buf.hover, "Hover Documentation")
	map("n", "gK", vim.lsp.buf.signature_help, "Signature Help")
	map("n", "<leader>cr", vim.lsp.buf.rename, "Rename Symbol")
	map("n", "<leader>cA", function()
		apply_code_action("source.fixAll")
	end, "Apply Safe Fixes")
	map("n", "<leader>co", function()
		apply_code_action("source.organizeImports")
	end, "Organize Imports")
	map("n", "gr", function()
		require("telescope.builtin").lsp_references({ include_declaration = false })
	end, "Goto References")
	map("n", "gI", function()
		require("telescope.builtin").lsp_implementations()
	end, "Goto Implementation")
	map("n", "gy", function()
		require("telescope.builtin").lsp_type_definitions()
	end, "Goto Type Definition")
	map("n", "<leader>cs", function()
		require("telescope.builtin").lsp_document_symbols()
	end, "Document Symbols")
	map("n", "<leader>cS", function()
		require("telescope.builtin").lsp_dynamic_workspace_symbols()
	end, "Workspace Symbols")
	map("n", "<leader>cl", vim.lsp.codelens.run, "Run Code Lens")

	if client and client.name == "clangd" then
		map("n", "<leader>cH", "<cmd>LspClangdSwitchSourceHeader<cr>", "Switch Source/Header")
	end

	if vim.lsp.inlay_hint and client and client:supports_method("textDocument/inlayHint") then
		map("n", "<leader>uh", function()
			local enabled = vim.lsp.inlay_hint.is_enabled({ bufnr = args.buf })
			vim.lsp.inlay_hint.enable(not enabled, { bufnr = args.buf })
		end, "Toggle Inlay Hints")
	end
end

return {
	{
		"mason-org/mason.nvim",
		lazy = false,
		opts = { ui = { border = "rounded" } },
	},
	{
		"mason-org/mason-lspconfig.nvim",
		lazy = false,
		dependencies = { "mason-org/mason.nvim", "neovim/nvim-lspconfig" },
		opts = {
			ensure_installed = {},
			automatic_enable = false,
		},
	},
	{
		"WhoIsSethDaniel/mason-tool-installer.nvim",
		lazy = false,
		dependencies = { "mason-org/mason.nvim" },
		opts = {
			ensure_installed = mason_tools,
			auto_update = false,
			run_on_start = false,
		},
	},
	{
		"neovim/nvim-lspconfig",
		lazy = false,
		dependencies = { "saghen/blink.cmp", "b0o/schemastore.nvim" },
		config = function()
			local severity = vim.diagnostic.severity
			vim.diagnostic.config({
				severity_sort = true,
				underline = true,
				virtual_text = {
					severity = { min = severity.WARN },
					source = "if_many",
					spacing = 2,
				},
				virtual_lines = {
					current_line = true,
					severity = { min = severity.ERROR },
				},
				signs = {
					text = {
						[severity.ERROR] = "E",
						[severity.WARN] = "W",
						[severity.INFO] = "I",
						[severity.HINT] = "H",
					},
				},
				update_in_insert = false,
				float = { border = "rounded", source = "if_many" },
			})

			local schemastore = require("schemastore")
			servers.jsonls.settings = {
				json = { schemas = schemastore.json.schemas(), validate = { enable = true } },
			}
			servers.yamlls.settings.yaml.schemaStore = { enable = false, url = "" }
			servers.yamlls.settings.yaml.schemas = schemastore.yaml.schemas()

			vim.lsp.config("*", { capabilities = require("blink.cmp").get_lsp_capabilities() })
			for name, config in pairs(servers) do
				vim.lsp.config(name, config)
			end

			require("config.tools").setup(servers)

			vim.api.nvim_create_autocmd("LspAttach", {
				group = vim.api.nvim_create_augroup("UserLspConfig", { clear = true }),
				callback = lsp_attach,
			})
		end,
	},
	{
		"mfussenegger/nvim-jdtls",
		ft = { "java" },
		dependencies = { "saghen/blink.cmp", "mfussenegger/nvim-dap" },
		config = function()
			local group = vim.api.nvim_create_augroup("UserJdtls", { clear = true })
			local start
			start = function(args)
				local scala_root = vim.fs.root(args.buf, { "build.sbt", "build.sc", ".scala-build" })
				if scala_root then
					return
				end

				local root = vim.fs.root(args.buf, {
					"mvnw",
					"gradlew",
					"pom.xml",
					"build.gradle",
					"build.gradle.kts",
					"settings.gradle",
					"settings.gradle.kts",
					".git",
				})
				if not root then
					root = vim.fs.dirname(vim.api.nvim_buf_get_name(args.buf))
				end
				if not root or root == "" then
					return
				end

				local mason = vim.fn.stdpath("data") .. "/mason"
				if vim.fn.executable(mason .. "/bin/jdtls") == 0 then
					require("config.tools").install({ "jdtls" }, function(ok)
						if ok and vim.api.nvim_buf_is_valid(args.buf) and vim.bo[args.buf].filetype == "java" then
							vim.api.nvim_buf_call(args.buf, function()
								start(args)
							end)
						end
					end)
					return
				end
				local bundles = {}
				local java_debug = mason .. "/share/java-debug-adapter/com.microsoft.java.debug.plugin.jar"
				if vim.fn.filereadable(java_debug) == 1 then
					table.insert(bundles, java_debug)
				end

				local config = {
					cmd = {
						mason .. "/bin/jdtls",
						"-data",
						vim.fn.stdpath("cache") .. "/jdtls-workspaces/" .. vim.fn.sha256(root):sub(1, 16),
					},
					cmd_env = { JAVA_HOME = java.launcher().path },
					root_dir = root,
					capabilities = require("blink.cmp").get_lsp_capabilities(),
					init_options = { bundles = bundles },
					dap = { hotcodereplace = "auto" },
					settings = {
						java = {
							configuration = { runtimes = java.runtimes() },
							completion = {
								favoriteStaticMembers = {
									"org.junit.jupiter.api.Assertions.*",
									"org.mockito.Mockito.*",
								},
							},
							format = { enabled = true },
							inlayHints = { parameterNames = { enabled = "literals" } },
						},
					},
				}

				require("jdtls").start_or_attach(config)
				local function map(mode, lhs, rhs, desc)
					vim.keymap.set(mode, lhs, rhs, { buffer = args.buf, desc = desc })
				end
				map("n", "<leader>cjo", function()
					require("jdtls").organize_imports()
				end, "Java Organize Imports")
				map("n", "<leader>cjv", function()
					require("jdtls").extract_variable()
				end, "Java Extract Variable")
				map("x", "<leader>cjv", function()
					require("jdtls").extract_variable(true)
				end, "Java Extract Variable")
				map("x", "<leader>cjm", function()
					require("jdtls").extract_method(true)
				end, "Java Extract Method")
			end

			vim.api.nvim_create_autocmd("FileType", {
				group = group,
				pattern = "java",
				callback = start,
			})
			vim.api.nvim_create_autocmd("User", {
				group = "UserJdtls",
				pattern = "LanguageToolsRetry",
				callback = function()
					if vim.bo.filetype == "java" then
						start({ buf = vim.api.nvim_get_current_buf() })
					end
				end,
			})
			if vim.bo.filetype == "java" then
				start({ buf = vim.api.nvim_get_current_buf() })
			end
		end,
	},
	{
		"scalameta/nvim-metals",
		ft = { "scala", "sbt", "java" },
		dependencies = { "nvim-lua/plenary.nvim", "saghen/blink.cmp", "mfussenegger/nvim-dap" },
		config = function()
			local function start(args)
				local root = vim.fs.root(args.buf, { "build.sbt", "build.sc", ".scala-build" })
				if not root and vim.bo[args.buf].filetype == "scala" then
					root = vim.fs.dirname(vim.api.nvim_buf_get_name(args.buf))
				end
				if not root or root == "" then
					return
				end

				local config = require("metals").bare_config()
				config.root_dir = root
				config.capabilities = require("blink.cmp").get_lsp_capabilities()
				config.settings = {
					serverVersion = "1.6.8",
					showImplicitArguments = true,
					showImplicitConversionsAndClasses = true,
					showInferredType = true,
				}
				config.on_attach = function()
					require("metals").setup_dap()
					local dap = require("dap")
					dap.configurations.scala = dap.configurations.scala
						or {
							{
								type = "scala",
								request = "launch",
								name = "Run or test current Scala file",
								metals = { runType = "runOrTestFile" },
							},
							{
								type = "scala",
								request = "launch",
								name = "Test current Scala target",
								metals = { runType = "testTarget" },
							},
							{
								type = "scala",
								request = "attach",
								name = "Attach to Scala/JVM on 5005",
								hostName = "localhost",
								port = 5005,
							},
						}
				end
				require("config.tools").metals(config.settings.serverVersion, function(ok)
					if ok and vim.api.nvim_buf_is_valid(args.buf) then
						vim.api.nvim_buf_call(args.buf, function()
							require("metals").initialize_or_attach(config)
						end)
					end
				end)
			end

			vim.api.nvim_create_autocmd("FileType", {
				group = vim.api.nvim_create_augroup("UserMetals", { clear = true }),
				pattern = { "scala", "sbt", "java" },
				callback = start,
			})
			vim.api.nvim_create_autocmd("User", {
				group = "UserMetals",
				pattern = "LanguageToolsRetry",
				callback = function()
					if vim.tbl_contains({ "scala", "sbt", "java" }, vim.bo.filetype) then
						start({ buf = vim.api.nvim_get_current_buf() })
					end
				end,
			})
			if vim.tbl_contains({ "scala", "sbt", "java" }, vim.bo.filetype) then
				start({ buf = vim.api.nvim_get_current_buf() })
			end
		end,
	},
}
