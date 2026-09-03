// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:b4f4030f85f0437e2d0360385ae55f1ace7268c9861051c4072c7651e25cfc63
import { Link } from "@muxui/react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function HomeIcon() {
	return /* @__PURE__ */ _jsxs("svg", {
		xmlns: "http://www.w3.org/2000/svg",
		viewBox: "0 0 24 24",
		width: "1em",
		height: "1em",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "2",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		focusable: "false",
		children: [/* @__PURE__ */ _jsx("path", { d: "m3 11 9-8 9 8" }), /* @__PURE__ */ _jsx("path", { d: "M5 10v10h14V10" })]
	});
}
function SettingsIcon() {
	return /* @__PURE__ */ _jsxs("svg", {
		xmlns: "http://www.w3.org/2000/svg",
		viewBox: "0 0 24 24",
		width: "1em",
		height: "1em",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "2",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		focusable: "false",
		children: [/* @__PURE__ */ _jsx("circle", {
			cx: "12",
			cy: "12",
			r: "3"
		}), /* @__PURE__ */ _jsx("path", { d: "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.5-1H6v-2.6h.1A1.7 1.7 0 0 0 7.6 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1L9 6.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5h2.6v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.5 1Z" })]
	});
}
export function LinkIconCompositionExample() {
	return /* @__PURE__ */ _jsxs("nav", {
		"aria-label": "Example navigation links",
		style: {
			display: "inline-flex",
			flexWrap: "wrap",
			gap: "0.75rem"
		},
		children: [/* @__PURE__ */ _jsxs(Link, {
			href: "/dashboard",
			children: [/* @__PURE__ */ _jsx(HomeIcon, {}), "Dashboard"]
		}), /* @__PURE__ */ _jsxs(Link, {
			href: "/settings",
			children: ["Settings", /* @__PURE__ */ _jsx(SettingsIcon, {})]
		})]
	});
}
