// @generated-from: packages/catalog/catalog-sources.json
// @generated-content-sha256: sha256:54826f5144b5bbd628289cc9b26732898df816eb5c5beb55d46314912885cc81
export type NativeProfileId = 'android' | 'ios' | 'native.react-native-web';
export type NativeProfile = Readonly<
  | { profile: 'android'; validationProfile: 'native.android'; strategy: 'adapted'; lifecycle: 'experimental'; platformSafetyRequirementSetDigest: "sha256:c39d058a275ca15be603f8975627e6fba9bb8ac4f9e71dd4e053e17bc4d4d479"; tokenRequirementSetDigest: "sha256:4b2756eb77bf5c7c7cf7cb67b6bf192f1f8b83cdb9be3a91ad51af0d3ae3359b"; }
  | { profile: 'ios'; validationProfile: 'native.ios'; strategy: 'adapted'; lifecycle: 'experimental'; platformSafetyRequirementSetDigest: "sha256:99b6af26b8b3af16af361660b8e3862dbb867fcb92f412fc905517b92fc67113"; tokenRequirementSetDigest: "sha256:b026280ba553d6342985e40c180276787c9d65fd2c1c0f0f3ec0b2fb5e5edc2b"; }
  | { profile: 'native.react-native-web'; validationProfile: 'native.react-native-web'; strategy: 'unsupported'; reason: "No responsible implementation in the first proof artifact."; platformSafetyRequirementSetDigest: "sha256:7fce639efab87e8d491ca3d3d7b4e1009e70636f4a83cd1e1d061c36891ec2be"; }
>;
export interface NativeProfileProjection {
  readonly schema: 'muxui-react-native-profile-projection-v1';
  readonly package: '@muxui/react-native';
  readonly componentId: 'muxui:component:button';
  readonly bindingRef: 'muxui:component:button#native.react-native';
  readonly bindingContentRevision: "sha256:9b50380991f8352fee4e0b72863558bf496dcef2c05877991044eb93196a645d";
  readonly bindingSpecRevision: "sha256:44f76d47c92401eaab0e3e04d27a94ad97f471bf5a3538e938cea73a3bed82cd";
  readonly componentSupportClaim: 'none';
  readonly platformSafetyContractDigest: "sha256:05aac25e3ce18edd5e441d7ab1de72edc88b753d5b86e373356755a6abe4f65e";
  readonly profiles: Readonly<Record<NativeProfileId, NativeProfile>>;
}
export const nativeProfileProjection: NativeProfileProjection;
export const nativeProfiles: Readonly<Record<NativeProfileId, NativeProfile>>;
