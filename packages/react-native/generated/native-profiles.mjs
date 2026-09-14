// @generated-from: packages/catalog/catalog-sources.json
// @generated-content-sha256: sha256:2b5c07bb2a47fbbae7b68fdaa580f8b4733851a7f1387338e24c5984f02b3929
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
export const nativeProfileProjection = deepFreeze({"bindingContentRevision":"sha256:9b50380991f8352fee4e0b72863558bf496dcef2c05877991044eb93196a645d","bindingRef":"muxui:component:button#native.react-native","bindingSpecRevision":"sha256:6858ae647602ca82646cd9728c281a29d8c6240aa30bfb1187243393b01272b8","componentId":"muxui:component:button","componentSupportClaim":"none","package":"@muxui/react-native","platformSafetyContractDigest":"sha256:05aac25e3ce18edd5e441d7ab1de72edc88b753d5b86e373356755a6abe4f65e","profiles":{"android":{"lifecycle":"experimental","platformSafetyRequirementSetDigest":"sha256:c39d058a275ca15be603f8975627e6fba9bb8ac4f9e71dd4e053e17bc4d4d479","profile":"android","strategy":"adapted","tokenRequirementSetDigest":"sha256:7a154a39c4ce148cb831e8fedb229abcea888e415664d0b01e2a28a83137956e","validationProfile":"native.android"},"ios":{"lifecycle":"experimental","platformSafetyRequirementSetDigest":"sha256:99b6af26b8b3af16af361660b8e3862dbb867fcb92f412fc905517b92fc67113","profile":"ios","strategy":"adapted","tokenRequirementSetDigest":"sha256:d97defa3ae510b005d71fe5d4936c99bf6a4fdaec450999015690c67b2b0c855","validationProfile":"native.ios"},"native.react-native-web":{"platformSafetyRequirementSetDigest":"sha256:7fce639efab87e8d491ca3d3d7b4e1009e70636f4a83cd1e1d061c36891ec2be","profile":"native.react-native-web","reason":"No responsible implementation in the first proof artifact.","strategy":"unsupported","validationProfile":"native.react-native-web"}},"schema":"muxui-react-native-profile-projection-v1"});
export const nativeProfiles = nativeProfileProjection.profiles;
