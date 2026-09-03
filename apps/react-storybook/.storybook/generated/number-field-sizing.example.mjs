// @generated-from: apps/react-storybook/src/generate-stories.mjs
// @generated-content-sha256: sha256:33e30e5dc13c939cbd4ace63c169b5882bbd84350eb5c0a283e7763db5fbe66a
import { NumberField } from "@muxui/react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SizingNumberFieldExample() {
	return /* @__PURE__ */ _jsxs("div", {
		className: "muxui-number-field-sizing-example",
		children: [
			/* @__PURE__ */ _jsx("style", { children: `
        .muxui-number-field-sizing-example {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: 100%;
        }

        .muxui-number-field-sizing-case {
          width: 100%;
        }

        .muxui-number-field-sizing-fixed {
          --muxui-component-number-field-width: 12rem;
        }

        .muxui-number-field-sizing-full {
          --muxui-component-number-field-width: 100%;
        }
      ` }),
			/* @__PURE__ */ _jsx("div", {
				className: "muxui-number-field-sizing-case",
				children: /* @__PURE__ */ _jsx(NumberField, {
					label: "Default fit-content",
					defaultValue: 1
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				className: "muxui-number-field-sizing-case",
				children: /* @__PURE__ */ _jsx(NumberField, {
					label: "Fixed 12rem",
					defaultValue: 1,
					className: "muxui-number-field-sizing-fixed"
				})
			}),
			/* @__PURE__ */ _jsx("div", {
				className: "muxui-number-field-sizing-case",
				children: /* @__PURE__ */ _jsx(NumberField, {
					label: "Full container width",
					defaultValue: 1,
					className: "muxui-number-field-sizing-full"
				})
			})
		]
	});
}
