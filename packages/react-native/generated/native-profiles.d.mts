// @generated-from: packages/catalog/catalog-sources.json
// @generated-content-sha256: sha256:a132c1e7e14a527f206676b0fba1f22e6a026e1ad8235429034a49e8ea2d8dda
export type NativeProfileId = 'android' | 'ios' | 'native.react-native-web';
export type NativeProfile = Readonly<
  | { profile: 'android'; validationProfile: 'native.android'; strategy: 'adapted'; lifecycle: 'experimental'; platformSafetyRequirementSetDigest: "sha256:c39d058a275ca15be603f8975627e6fba9bb8ac4f9e71dd4e053e17bc4d4d479"; tokenRequirementSetDigest: "sha256:565db398806f26881e24da47ffc1bf1b242c039796e0af5399dd6c50d1ceb719"; }
  | { profile: 'ios'; validationProfile: 'native.ios'; strategy: 'adapted'; lifecycle: 'experimental'; platformSafetyRequirementSetDigest: "sha256:99b6af26b8b3af16af361660b8e3862dbb867fcb92f412fc905517b92fc67113"; tokenRequirementSetDigest: "sha256:501993fa0060daa46f147a2bea59a12ece7d256089ea52e309fb8004bc2a8e79"; }
  | { profile: 'native.react-native-web'; validationProfile: 'native.react-native-web'; strategy: 'unsupported'; reason: "No responsible implementation in the first proof artifact."; platformSafetyRequirementSetDigest: "sha256:7fce639efab87e8d491ca3d3d7b4e1009e70636f4a83cd1e1d061c36891ec2be"; }
>;
export interface NativeProfileProjection {
  readonly schema: 'muxui-react-native-profile-projection-v1';
  readonly package: '@muxui/react-native';
  readonly componentId: 'muxui:component:button';
  readonly bindingRef: 'muxui:component:button#native.react-native';
  readonly bindingContentRevision: "sha256:9b50380991f8352fee4e0b72863558bf496dcef2c05877991044eb93196a645d";
  readonly bindingSpecRevision: "sha256:af499cbf6c85cee8b86de0315ee6c1abb3a21fc979c3982d9a4f068bfe1ad4c5";
  readonly componentSupportClaim: 'none';
  readonly platformSafetyContractDigest: "sha256:05aac25e3ce18edd5e441d7ab1de72edc88b753d5b86e373356755a6abe4f65e";
  readonly profiles: Readonly<Record<NativeProfileId, NativeProfile>>;
}
export const nativeProfileProjection: NativeProfileProjection;
export const nativeProfiles: Readonly<Record<NativeProfileId, NativeProfile>>;
