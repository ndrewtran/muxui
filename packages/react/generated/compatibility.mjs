// @generated-from: packages/react/src/generate.mjs
// @generated-content-sha256: sha256:19ed4960ef4d35b2765118003c9878c720ed73f2bec9f85f6f3d89198ffadb57
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
export const reactCompatibility = deepFreeze({"compatibilityProfile":{"notClaimed":["assistive technology","zoom","locale","browsers outside Google Chrome 151"],"runtimeProfile":"web.react","status":"representative-baseline","tested":{"browserMatrix":{"axe":"4.13.0","browser":"Google Chrome 151","profiles":["light/standard/full/comfortable/ltr","dark/standard/full/comfortable/ltr","light/more/full/comfortable/ltr","light/standard/reduced/comfortable/ltr","light/standard/full/compact/ltr","light/standard/full/comfortable/rtl"],"source":"apps/react-playground/test/browser.test.mjs"},"node":">=24.19.0 <25","react":">=19.2.0 <20","reactDom":">=19.2.0 <20"}},"package":"@muxui/react","performance":{"budgets":{"packedImportMilliseconds":2000,"ssrMilliseconds":1000},"method":"release preparation measures packed import and SSR","status":"representative-baseline"},"publication":{"candidateVersion":"0.1.0-rc.1","private":true,"requires":["explicit external publish authorization"],"status":"disabled"},"schema":"muxui-react-compatibility-v1","support":"unproved; R1.5 React exports only","tokenSource":{"path":"catalog/tokens/default-theme.json","sha256":"26c0d91426e3514cb2582039ba0e977cfd0f0e96bf6388eaa2939e36507bc7a8"},"upstream":{"gitHead":"5ecb3333001313e83898cd07644227897e3bae1f","package":"react-aria-components","version":"1.20.0"},"version":"0.1.0-alpha.0"});
