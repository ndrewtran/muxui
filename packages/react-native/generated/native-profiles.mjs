// @generated-from: packages/catalog/catalog-sources.json
// @generated-content-sha256: sha256:425a0ca4c92527e0e2b34947ea5d3d66e7eeda9d7c1c82ca015b29e771385833
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
export const nativeProfileProjection = deepFreeze({"bindingContentRevision":"sha256:9b50380991f8352fee4e0b72863558bf496dcef2c05877991044eb93196a645d","bindingRef":"muxui:component:button#native.react-native","bindingSpecRevision":"sha256:0bb72e0bf196f3b4868d0bdd09c3742d0ad9e15c350ffedcbb0d29ac3f6f1d41","componentId":"muxui:component:button","componentSupportClaim":"none","package":"@muxui/react-native","platformSafetyContractDigest":"sha256:05aac25e3ce18edd5e441d7ab1de72edc88b753d5b86e373356755a6abe4f65e","profiles":{"android":{"lifecycle":"experimental","platformSafetyRequirementSetDigest":"sha256:c39d058a275ca15be603f8975627e6fba9bb8ac4f9e71dd4e053e17bc4d4d479","profile":"android","strategy":"adapted","tokenRequirementSetDigest":"sha256:52ff0cc780a8516d53564931770ba34b9d2132448630be74424199110a6404bc","validationProfile":"native.android"},"ios":{"lifecycle":"experimental","platformSafetyRequirementSetDigest":"sha256:99b6af26b8b3af16af361660b8e3862dbb867fcb92f412fc905517b92fc67113","profile":"ios","strategy":"adapted","tokenRequirementSetDigest":"sha256:55acba73a57b19886774dabfa155575e339cd65dd22a24e193159cd017cc968a","validationProfile":"native.ios"},"native.react-native-web":{"platformSafetyRequirementSetDigest":"sha256:7fce639efab87e8d491ca3d3d7b4e1009e70636f4a83cd1e1d061c36891ec2be","profile":"native.react-native-web","reason":"No responsible implementation in the first proof artifact.","strategy":"unsupported","validationProfile":"native.react-native-web"}},"schema":"muxui-react-native-profile-projection-v1"});
export const nativeProfiles = nativeProfileProjection.profiles;
