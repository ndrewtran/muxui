// @generated-from: packages/catalog/catalog-sources.json
// @generated-content-sha256: sha256:e7dd531ba15cc29caa5d4be0f3e7eecc23533196ad1f05b82d5d85b85113ff80
export type NativeProfileId = 'android' | 'ios' | 'native.react-native-web';
export type NativeProfile = Readonly<
  | { profile: 'android'; validationProfile: 'native.android'; strategy: 'adapted'; lifecycle: 'experimental'; platformSafetyRequirementSetDigest: "sha256:c39d058a275ca15be603f8975627e6fba9bb8ac4f9e71dd4e053e17bc4d4d479"; tokenRequirementSetDigest: "sha256:52ff0cc780a8516d53564931770ba34b9d2132448630be74424199110a6404bc"; }
  | { profile: 'ios'; validationProfile: 'native.ios'; strategy: 'adapted'; lifecycle: 'experimental'; platformSafetyRequirementSetDigest: "sha256:99b6af26b8b3af16af361660b8e3862dbb867fcb92f412fc905517b92fc67113"; tokenRequirementSetDigest: "sha256:55acba73a57b19886774dabfa155575e339cd65dd22a24e193159cd017cc968a"; }
  | { profile: 'native.react-native-web'; validationProfile: 'native.react-native-web'; strategy: 'unsupported'; reason: "No responsible implementation in the first proof artifact."; platformSafetyRequirementSetDigest: "sha256:7fce639efab87e8d491ca3d3d7b4e1009e70636f4a83cd1e1d061c36891ec2be"; }
>;
export interface NativeProfileProjection {
  readonly schema: 'muxui-react-native-profile-projection-v1';
  readonly package: '@muxui/react-native';
  readonly componentId: 'muxui:component:button';
  readonly bindingRef: 'muxui:component:button#native.react-native';
  readonly bindingContentRevision: "sha256:9b50380991f8352fee4e0b72863558bf496dcef2c05877991044eb93196a645d";
  readonly bindingSpecRevision: "sha256:0bb72e0bf196f3b4868d0bdd09c3742d0ad9e15c350ffedcbb0d29ac3f6f1d41";
  readonly componentSupportClaim: 'none';
  readonly platformSafetyContractDigest: "sha256:05aac25e3ce18edd5e441d7ab1de72edc88b753d5b86e373356755a6abe4f65e";
  readonly profiles: Readonly<Record<NativeProfileId, NativeProfile>>;
}
export const nativeProfileProjection: NativeProfileProjection;
export const nativeProfiles: Readonly<Record<NativeProfileId, NativeProfile>>;
