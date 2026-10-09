local directory = require("wezterm").config_dir .. "/../theme"
local palette = dofile(directory .. "/palette.lua")(directory .. "/palette.tsv")
local M = {}

function M.options(mode)
	local p = palette.get(mode)
	local ansi, brights = palette.ansi(p)
	local accent = mode == "dark" and p.iris or p.pine
	return {
		colors = {
			foreground = p.text,
			background = p.base,
			cursor_bg = p.text,
			cursor_fg = p.base,
			cursor_border = p.text,
			selection_fg = p.text,
			selection_bg = p.highlight_med,
			ansi = ansi,
			brights = brights,
			scrollbar_thumb = p.highlight_high,
			split = p.highlight_high,
			compose_cursor = p.gold,
			visual_bell = p.overlay,
			copy_mode_active_highlight_bg = { Color = accent },
			copy_mode_active_highlight_fg = { Color = p.base },
			copy_mode_inactive_highlight_bg = { Color = p.highlight_med },
			copy_mode_inactive_highlight_fg = { Color = p.text },
			quick_select_label_bg = { Color = accent },
			quick_select_label_fg = { Color = p.base },
			quick_select_match_bg = { Color = p.highlight_med },
			quick_select_match_fg = { Color = p.text },
			tab_bar = {
				background = p.base,
				active_tab = { bg_color = accent, fg_color = p.base, intensity = "Bold" },
				inactive_tab = { bg_color = p.surface, fg_color = p.text },
				inactive_tab_hover = { bg_color = p.overlay, fg_color = p.text },
				new_tab = { bg_color = p.surface, fg_color = p.subtle },
				new_tab_hover = { bg_color = p.overlay, fg_color = p.text },
				inactive_tab_edge = p.highlight_med,
			},
		},
		window_frame = {
			active_titlebar_bg = p.base,
			inactive_titlebar_bg = p.base,
			active_titlebar_fg = p.text,
			inactive_titlebar_fg = p.subtle,
			active_titlebar_border_bottom = p.highlight_med,
			inactive_titlebar_border_bottom = p.highlight_med,
			button_fg = p.text,
			button_bg = p.base,
			button_hover_fg = p.text,
			button_hover_bg = p.overlay,
		},
		command_palette_bg_color = p.surface,
		command_palette_fg_color = p.text,
		char_select_bg_color = p.surface,
		char_select_fg_color = p.text,
	}
end

-- Compare only owned color fields and preserve unrelated nested overrides
-- (for example a per-window titlebar font) when refreshing the palette.
function M.matches(actual, expected)
	if type(expected) ~= "table" then
		return actual == expected
	end
	if type(actual) ~= "table" then
		return false
	end
	for key, value in pairs(expected) do
		if not M.matches(actual[key], value) then
			return false
		end
	end
	return true
end

function M.merge(target, values)
	for key, value in pairs(values) do
		if type(value) == "table" then
			target[key] = type(target[key]) == "table" and target[key] or {}
			M.merge(target[key], value)
		else
			target[key] = value
		end
	end
	return target
end

return M
