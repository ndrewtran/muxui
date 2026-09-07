// @generated-from: packages/catalog/catalog-sources.json
// @generated-content-sha256: sha256:7ded6693f7d40c60b8d065d88cec905b15e28e94f8a15aa5394080d61adde2f1
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}
export const nativeProfileProjection = deepFreeze({"bindingContentRevision":"sha256:9b50380991f8352fee4e0b72863558bf496dcef2c05877991044eb93196a645d","bindingRef":"muxui:component:button#native.react-native","bindingSpecRevision":"sha256:af499cbf6c85cee8b86de0315ee6c1abb3a21fc979c3982d9a4f068bfe1ad4c5","componentId":"muxui:component:button","componentSupportClaim":"none","package":"@muxui/react-native","platformSafetyContractDigest":"sha256:05aac25e3ce18edd5e441d7ab1de72edc88b753d5b86e373356755a6abe4f65e","profiles":{"android":{"lifecycle":"experimental","platformSafetyRequirementSetDigest":"sha256:c39d058a275ca15be603f8975627e6fba9bb8ac4f9e71dd4e053e17bc4d4d479","profile":"android","strategy":"adapted","tokenRequirementSetDigest":"sha256:565db398806f26881e24da47ffc1bf1b242c039796e0af5399dd6c50d1ceb719","validationProfile":"native.android"},"ios":{"lifecycle":"experimental","platformSafetyRequirementSetDigest":"sha256:99b6af26b8b3af16af361660b8e3862dbb867fcb92f412fc905517b92fc67113","profile":"ios","strategy":"adapted","tokenRequirementSetDigest":"sha256:501993fa0060daa46f147a2bea59a12ece7d256089ea52e309fb8004bc2a8e79","validationProfile":"native.ios"},"native.react-native-web":{"platformSafetyRequirementSetDigest":"sha256:7fce639efab87e8d491ca3d3d7b4e1009e70636f4a83cd1e1d061c36891ec2be","profile":"native.react-native-web","reason":"No responsible implementation in the first proof artifact.","strategy":"unsupported","validationProfile":"native.react-native-web"}},"schema":"muxui-react-native-profile-projection-v1"});
export const nativeProfiles = nativeProfileProjection.profiles;
