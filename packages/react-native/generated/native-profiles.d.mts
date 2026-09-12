// @generated-from: packages/catalog/catalog-sources.json
// @generated-content-sha256: sha256:eb8f0352da7deb34ee5d2084b020616c96d13d87556d292452caa6a81d921a39
export type NativeProfileId = 'android' | 'ios' | 'native.react-native-web';
export type NativeProfile = Readonly<
  | { profile: 'android'; validationProfile: 'native.android'; strategy: 'adapted'; lifecycle: 'experimental'; platformSafetyRequirementSetDigest: "sha256:c39d058a275ca15be603f8975627e6fba9bb8ac4f9e71dd4e053e17bc4d4d479"; tokenRequirementSetDigest: "sha256:0882bd2960467350f03b822494847fdc33a45772493d5e57329ba71aec7d7bb2"; }
  | { profile: 'ios'; validationProfile: 'native.ios'; strategy: 'adapted'; lifecycle: 'experimental'; platformSafetyRequirementSetDigest: "sha256:99b6af26b8b3af16af361660b8e3862dbb867fcb92f412fc905517b92fc67113"; tokenRequirementSetDigest: "sha256:4d0128ca4d2e8c2d68e134f43eb82be9818f0e0aeec05fcb5900a9ded14fe671"; }
  | { profile: 'native.react-native-web'; validationProfile: 'native.react-native-web'; strategy: 'unsupported'; reason: "No responsible implementation in the first proof artifact."; platformSafetyRequirementSetDigest: "sha256:7fce639efab87e8d491ca3d3d7b4e1009e70636f4a83cd1e1d061c36891ec2be"; }
>;
export interface NativeProfileProjection {
  readonly schema: 'muxui-react-native-profile-projection-v1';
  readonly package: '@muxui/react-native';
  readonly componentId: 'muxui:component:button';
  readonly bindingRef: 'muxui:component:button#native.react-native';
  readonly bindingContentRevision: "sha256:9b50380991f8352fee4e0b72863558bf496dcef2c05877991044eb93196a645d";
  readonly bindingSpecRevision: "sha256:edfdc82deb88c8990fb9771891df7ab9426fc0f520dc93f81b8bbf03f1110d5c";
  readonly componentSupportClaim: 'none';
  readonly platformSafetyContractDigest: "sha256:05aac25e3ce18edd5e441d7ab1de72edc88b753d5b86e373356755a6abe4f65e";
  readonly profiles: Readonly<Record<NativeProfileId, NativeProfile>>;
}
export const nativeProfileProjection: NativeProfileProjection;
export const nativeProfiles: Readonly<Record<NativeProfileId, NativeProfile>>;
