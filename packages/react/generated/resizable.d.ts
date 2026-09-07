// @generated-from: packages/react/src/supplemental/resizable.d.ts
// @generated-content-sha256: sha256:517813e27124d30953baa7094a1deec08bc9ea7a59d292e90c72e870cacc870a
import type * as React from 'react';
export type ResizableSizes = Readonly<Record<string, number>>;
export type ResizableChange = { handleId: string; source: 'pointer' | 'keyboard' };
export type ResizableBaseProps = React.HTMLAttributes<HTMLDivElement> & {
  onSizesChange?: (sizes: ResizableSizes, meta: ResizableChange) => void;
  onSizesCommit?: (sizes: ResizableSizes, meta: ResizableChange) => void;
  orientation?: 'horizontal' | 'vertical';
  keyboardStep?: number;
  keyboardLargeStep?: number;
  precision?: number;
  disabled?: boolean;
  readOnly?: boolean;
};
export type ResizableProps = ResizableBaseProps & (
  | { sizes: ResizableSizes; defaultSizes?: never }
  | { sizes?: never; defaultSizes?: ResizableSizes }
);
export declare function Resizable(props: ResizableProps): React.ReactElement;
export declare function ResizablePanel(props: React.HTMLAttributes<HTMLDivElement> & { id: string; minSize?: number; maxSize?: number }): React.ReactElement;
export declare function ResizableHandle(props: React.HTMLAttributes<HTMLDivElement> & { id: string; before: string; after: string; disabled?: boolean }): React.ReactElement;
