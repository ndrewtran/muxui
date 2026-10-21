import type * as React from 'react';
import type { ButtonActivationEvent, ButtonProps } from '@muxui/react';
export type LightboxKey = string | number;
export type LightboxItem = { key: LightboxKey; label?: string };
export type LightboxRenderContext = { key: LightboxKey; index: number; count: number };
export type LightboxContentRenderContext = LightboxRenderContext & { item: LightboxItem };
export type LightboxRenderContent = (item: LightboxItem, context: LightboxRenderContext) => React.ReactNode;
export interface LightboxProps extends React.HTMLAttributes<HTMLDivElement> {
  items: readonly LightboxItem[];
  renderContent?: LightboxRenderContent;
  selectedKey?: LightboxKey | null;
  defaultSelectedKey?: LightboxKey | null;
  onSelectedChange?: (key: LightboxKey | null, item?: LightboxItem | null) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  loop?: boolean;
  swipeNavigation?: boolean;
}
export declare function Lightbox(props: LightboxProps): React.ReactElement;
// A mapped copy of Button's props, not ButtonProps itself: an interface is not assignable to
// Record<string, unknown>, and these types were object literal types before they followed Button.
export type LightboxTriggerProps = { [K in keyof ButtonProps]: ButtonProps[K] } & { itemKey: LightboxKey };
export declare const LightboxTrigger: React.ForwardRefExoticComponent<LightboxTriggerProps & React.RefAttributes<HTMLButtonElement>>;
export declare function LightboxBackdrop(props: React.HTMLAttributes<HTMLDivElement> & { dismissable?: boolean }): React.ReactElement | null;
export declare function LightboxPopup(props: React.HTMLAttributes<HTMLDivElement>): React.ReactElement | null;
export declare function LightboxContent(props: React.HTMLAttributes<HTMLDivElement> & { renderContent?: (context: LightboxContentRenderContext) => React.ReactNode }): React.ReactElement | null;
export declare const LightboxCaption: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLParagraphElement> & React.RefAttributes<HTMLParagraphElement>>;
export type LightboxControlActivation = { [K in keyof ButtonActivationEvent]: ButtonActivationEvent[K] };
export type LightboxControlProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { disabled?: boolean; onActivate?: (event: LightboxControlActivation) => void };
export declare function LightboxPrevious(props: LightboxControlProps): React.ReactElement;
export declare function LightboxNext(props: LightboxControlProps): React.ReactElement;
export declare function LightboxClose(props: LightboxControlProps): React.ReactElement;
