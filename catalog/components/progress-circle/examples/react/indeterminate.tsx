import { ProgressCircle } from "@muxui/react";

export function IndeterminateProgressCircleExample() {
  return <ProgressCircle.Root value={null} size="sm" label="Loading tab"><ProgressCircle.Track /></ProgressCircle.Root>;
}
