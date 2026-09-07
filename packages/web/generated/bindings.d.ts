// @generated-from: packages/catalog/catalog-sources.json
// @generated-content-sha256: sha256:240bed851fc1bb78465f4870307607c43ce9f006a81b459db3bfd59fef98713c
export interface ButtonWebHtmlBinding {
  readonly bindingRef: "muxui:component:button#web.html";
  readonly props: {
    readonly "disabled"?: boolean;
  };
  readonly events: {
    readonly "activate": CustomEvent<void>;
  };
  readonly slots: "root" | "label";
}

export interface ButtonWebReactBinding {
  readonly bindingRef: "muxui:component:button#web.react";
  readonly props: {
    readonly "disabled"?: boolean;
    readonly "pending"?: boolean;
    readonly "showTextWhileLoading"?: boolean;
    readonly "variant"?: string;
    readonly "tone"?: string;
    readonly "size"?: string;
  };
  readonly events: {
    readonly "activate": CustomEvent<void>;
  };
  readonly slots: "root" | "label";
}
