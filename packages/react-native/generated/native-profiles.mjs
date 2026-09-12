// @generated-from: packages/catalog/catalog-sources.json
// @generated-content-sha256: sha256:92eb47f711eeedc05cd154e74d7f111f5ccb9f1390367f6f2c175e906385ab2a
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
export const nativeProfileProjection = deepFreeze({"bindingContentRevision":"sha256:9b50380991f8352fee4e0b72863558bf496dcef2c05877991044eb93196a645d","bindingRef":"muxui:component:button#native.react-native","bindingSpecRevision":"sha256:edfdc82deb88c8990fb9771891df7ab9426fc0f520dc93f81b8bbf03f1110d5c","componentId":"muxui:component:button","componentSupportClaim":"none","package":"@muxui/react-native","platformSafetyContractDigest":"sha256:05aac25e3ce18edd5e441d7ab1de72edc88b753d5b86e373356755a6abe4f65e","profiles":{"android":{"lifecycle":"experimental","platformSafetyRequirementSetDigest":"sha256:c39d058a275ca15be603f8975627e6fba9bb8ac4f9e71dd4e053e17bc4d4d479","profile":"android","strategy":"adapted","tokenRequirementSetDigest":"sha256:0882bd2960467350f03b822494847fdc33a45772493d5e57329ba71aec7d7bb2","validationProfile":"native.android"},"ios":{"lifecycle":"experimental","platformSafetyRequirementSetDigest":"sha256:99b6af26b8b3af16af361660b8e3862dbb867fcb92f412fc905517b92fc67113","profile":"ios","strategy":"adapted","tokenRequirementSetDigest":"sha256:4d0128ca4d2e8c2d68e134f43eb82be9818f0e0aeec05fcb5900a9ded14fe671","validationProfile":"native.ios"},"native.react-native-web":{"platformSafetyRequirementSetDigest":"sha256:7fce639efab87e8d491ca3d3d7b4e1009e70636f4a83cd1e1d061c36891ec2be","profile":"native.react-native-web","reason":"No responsible implementation in the first proof artifact.","strategy":"unsupported","validationProfile":"native.react-native-web"}},"schema":"muxui-react-native-profile-projection-v1"});
export const nativeProfiles = nativeProfileProjection.profiles;
