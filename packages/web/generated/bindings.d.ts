// @generated-from: packages/catalog/catalog-sources.json
// @generated-content-sha256: sha256:3fd06e120fa7306d006f1e15061d94e619f2fa44232318f414e18b87c01d7469
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
    readonly "variant"?: string;
    readonly "tone"?: string;
    readonly "size"?: string;
  };
  readonly events: {
    readonly "activate": CustomEvent<void>;
  };
  readonly slots: "root" | "label";
}
