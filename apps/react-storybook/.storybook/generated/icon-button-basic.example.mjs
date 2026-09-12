// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:825a529cc7cc57ea3623db6dbd224cfe49534b86cd2b9d7d3745c73e26bd2a48
import { IconButton } from "@muxui/react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function SearchIcon() {
	return /* @__PURE__ */ _jsxs("svg", {
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "2",
		children: [/* @__PURE__ */ _jsx("circle", {
			cx: "10.5",
			cy: "10.5",
			r: "6.5"
		}), /* @__PURE__ */ _jsx("path", { d: "m16 16 4 4" })]
	});
}
export function BasicIconButtonExample() {
	return /* @__PURE__ */ _jsxs("div", {
		style: {
			display: "flex",
			alignItems: "center",
			gap: "1rem"
		},
		children: [
			/* @__PURE__ */ _jsx(IconButton, {
				"aria-label": "Search",
				size: "sm",
				children: /* @__PURE__ */ _jsx(SearchIcon, {})
			}),
			/* @__PURE__ */ _jsx(IconButton, {
				"aria-label": "Search",
				variant: "neutral",
				children: /* @__PURE__ */ _jsx(SearchIcon, {})
			}),
			/* @__PURE__ */ _jsx(IconButton, {
				"aria-label": "Search",
				size: "lg",
				variant: "primary",
				children: /* @__PURE__ */ _jsx(SearchIcon, {})
			}),
			/* @__PURE__ */ _jsx(IconButton, {
				"aria-label": "Search",
				disabled: true,
				children: /* @__PURE__ */ _jsx(SearchIcon, {})
			}),
			/* @__PURE__ */ _jsx(IconButton, {
				"aria-label": "Searching",
				pending: true,
				children: /* @__PURE__ */ _jsx(SearchIcon, {})
			})
		]
	});
}
