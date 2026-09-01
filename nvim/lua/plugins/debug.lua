local mason = vim.fn.stdpath("data") .. "/mason"
local mason_bin = mason .. "/bin/"

local function project_root(markers)
	return vim.fs.root(0, markers) or vim.fn.getcwd()
end

local function python_path()
	local root = project_root({ "pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", ".git" })
	for _, candidate in ipairs({ root .. "/.venv/bin/python", root .. "/venv/bin/python" }) do
		if vim.fn.executable(candidate) == 1 then
			return candidate
		end
	end
	if vim.env.VIRTUAL_ENV and vim.fn.executable(vim.env.VIRTUAL_ENV .. "/bin/python") == 1 then
		return vim.env.VIRTUAL_ENV .. "/bin/python"
	end
	return vim.fn.exepath("python3")
end

local function kotlin_main_class()
	local file = vim.api.nvim_buf_get_name(0)
	if file == "" then
		vim.notify("Save the Kotlin file before debugging", vim.log.levels.WARN)
		return require("dap").ABORT
	end
	local package_name
	for _, line in ipairs(vim.fn.readfile(file, "", 200)) do
		package_name = line:match("^%s*package%s+([%w_.]+)")
		if package_name then
			break
		end
	end
	local class_name = vim.fs.basename(file):gsub("%.kt$", "") .. "Kt"
	local default = package_name and (package_name .. "." .. class_name) or class_name
	return vim.fn.input("Kotlin main class: ", default)
end

local function kotlin_project_root()
	local root = vim.fs.root(0, {
		"settings.gradle",
		"settings.gradle.kts",
		"build.gradle",
		"build.gradle.kts",
		"pom.xml",
	})
	if not root then
		vim.notify("Kotlin debugging requires a Gradle or Maven project", vim.log.levels.ERROR)
		return require("dap").ABORT
	end

	local has_gradle = vim.fn.filereadable(root .. "/settings.gradle") == 1
		or vim.fn.filereadable(root .. "/settings.gradle.kts") == 1
		or vim.fn.filereadable(root .. "/build.gradle") == 1
		or vim.fn.filereadable(root .. "/build.gradle.kts") == 1
	if has_gradle and vim.fn.executable(root .. "/gradlew") == 0 and vim.fn.executable("gradle") == 0 then
		vim.notify("Kotlin debugging needs this project's gradlew wrapper", vim.log.levels.ERROR)
		return require("dap").ABORT
	end

	if vim.fn.isdirectory(root .. "/build") == 0 and vim.fn.isdirectory(root .. "/target") == 0 then
		vim.notify("Build the Kotlin project before starting its debugger", vim.log.levels.WARN)
	end
	return root
end

return {
	{
		"mfussenegger/nvim-dap",
		dependencies = {
			"mfussenegger/nvim-dap-python",
			"leoluz/nvim-dap-go",
			"igorlfs/nvim-dap-view",
		},
		keys = {
			{
				"<leader>Dc",
				function()
					require("dap").continue()
				end,
				desc = "Start / Continue",
			},
			{
				"<leader>Dt",
				function()
					require("dap").toggle_breakpoint()
				end,
				desc = "Toggle Breakpoint",
			},
			{
				"<leader>Db",
				function()
					require("dap").set_breakpoint(vim.fn.input("Breakpoint condition: "))
				end,
				desc = "Conditional Breakpoint",
			},
			{
				"<leader>Do",
				function()
					require("dap").step_over()
				end,
				desc = "Step Over",
			},
			{
				"<leader>Di",
				function()
					require("dap").step_into()
				end,
				desc = "Step Into",
			},
			{
				"<leader>DO",
				function()
					require("dap").step_out()
				end,
				desc = "Step Out",
			},
			{
				"<leader>DP",
				function()
					require("dap").pause()
				end,
				desc = "Pause",
			},
			{
				"<leader>Dl",
				function()
					require("dap").run_last()
				end,
				desc = "Run Last",
			},
			{
				"<leader>Dq",
				function()
					require("dap").terminate()
				end,
				desc = "Terminate",
			},
			{
				"<leader>Dr",
				function()
					require("dap").repl.toggle()
				end,
				desc = "Toggle REPL",
			},
			{
				"<leader>Du",
				function()
					require("dap-view").toggle(true)
				end,
				desc = "Toggle Debug UI",
			},
			{
				"<leader>De",
				function()
					require("dap-view").hover(nil, true)
				end,
				mode = { "n", "x" },
				desc = "Evaluate Expression",
			},
			{
				"<leader>Dpn",
				function()
					require("dap-python").test_method()
				end,
				desc = "Debug Python Nearest Test",
			},
			{
				"<leader>Dpc",
				function()
					require("dap-python").test_class()
				end,
				desc = "Debug Python Test Class",
			},
			{
				"<leader>Dgt",
				function()
					require("dap-go").debug_test()
				end,
				desc = "Debug Go Nearest Test",
			},
		},
		config = function()
			local dap = require("dap")
			local dapview = require("dap-view")

			vim.fn.sign_define("DapBreakpoint", { text = "●", texthl = "DiagnosticError" })
			vim.fn.sign_define("DapBreakpointCondition", { text = "◆", texthl = "DiagnosticWarn" })
			vim.fn.sign_define("DapStopped", { text = "▶", texthl = "DiagnosticInfo", linehl = "Visual" })
			vim.fn.sign_define("DapBreakpointRejected", { text = "○", texthl = "DiagnosticWarn" })

			dapview.setup({
				auto_toggle = true,
				follow_tab = true,
				windows = { position = "below", size = 0.3 },
				virtual_text = { enabled = true, position = "eol" },
				winbar = { controls = { enabled = true } },
			})

			local dap_python = require("dap-python")
			dap_python.setup(mason_bin .. "debugpy-adapter")
			dap_python.resolve_python = python_path
			require("dap-go").setup({ delve = { path = mason_bin .. "dlv" } })

			dap.adapters["pwa-node"] = {
				type = "server",
				host = "127.0.0.1",
				port = "${port}",
				executable = {
					command = mason_bin .. "js-debug-adapter",
					-- dapDebugServer defaults to localhost, which resolves to IPv6 on macOS;
					-- keep the server and nvim-dap client on the same IPv4 loopback address.
					args = { "${port}", "127.0.0.1" },
				},
			}
			dap.adapters["pwa-chrome"] = dap.adapters["pwa-node"]
			dap.adapters.node = dap.adapters["pwa-node"]
			dap.adapters.chrome = dap.adapters["pwa-node"]
			local javascript = {
				{
					type = "pwa-node",
					request = "launch",
					name = "Current file",
					program = "${file}",
					cwd = "${workspaceFolder}",
					sourceMaps = true,
					console = "integratedTerminal",
				},
				{
					type = "pwa-node",
					request = "attach",
					name = "Attach to Node process",
					processId = require("dap.utils").pick_process,
					cwd = "${workspaceFolder}",
				},
				{
					type = "pwa-chrome",
					request = "launch",
					name = "Browser application",
					url = function()
						return vim.fn.input("Application URL: ", "http://localhost:5173")
					end,
					webRoot = "${workspaceFolder}",
				},
			}
			local typescript = vim.deepcopy(javascript)
			typescript[1].name = "Current file with tsx"
			typescript[1].runtimeExecutable = "npx"
			typescript[1].runtimeArgs = { "--no-install", "tsx" }
			for _, ft in ipairs({ "javascript", "javascriptreact" }) do
				dap.configurations[ft] = javascript
			end
			for _, ft in ipairs({ "typescript", "typescriptreact" }) do
				dap.configurations[ft] = typescript
			end

			dap.adapters.codelldb = {
				type = "server",
				port = "${port}",
				executable = { command = mason_bin .. "codelldb", args = { "--port", "${port}" } },
			}
			local native = {
				{
					type = "codelldb",
					request = "launch",
					name = "Launch executable",
					program = function()
						return vim.fn.input("Path to executable: ", vim.fn.getcwd() .. "/", "file")
					end,
					cwd = "${workspaceFolder}",
					stopOnEntry = false,
				},
			}
			dap.configurations.c = native
			dap.configurations.cpp = native

			dap.adapters.kotlin = {
				type = "executable",
				command = mason_bin .. "kotlin-debug-adapter",
				options = { initialize_timeout_sec = 15 },
			}
			dap.configurations.kotlin = {
				{
					type = "kotlin",
					request = "launch",
					name = "Current Kotlin main (built project)",
					projectRoot = kotlin_project_root,
					mainClass = kotlin_main_class,
				},
				{
					type = "kotlin",
					request = "attach",
					name = "Attach to Kotlin/JVM on 5005",
					projectRoot = kotlin_project_root,
					hostName = "localhost",
					port = 5005,
					timeout = 2000,
				},
			}

			vim.api.nvim_create_user_command("DapLoadLaunchJSON", function()
				require("dap.ext.vscode").load_launchjs(nil, {
					["pwa-node"] = { "javascript", "javascriptreact", "typescript", "typescriptreact" },
					["pwa-chrome"] = { "javascript", "javascriptreact", "typescript", "typescriptreact" },
					node = { "javascript", "javascriptreact", "typescript", "typescriptreact" },
					chrome = { "javascript", "javascriptreact", "typescript", "typescriptreact" },
					python = { "python" },
					go = { "go" },
					java = { "java" },
					codelldb = { "c", "cpp" },
					kotlin = { "kotlin" },
				})
			end, { desc = "Load project .vscode/launch.json debug configurations" })
		end,
	},
}
