import { ProgressCircle } from "@muxui/react";

export function BasicProgressCircleExample() {
  return <ProgressCircle.Root value={65}><ProgressCircle.Track /><ProgressCircle.Label>Upload progress</ProgressCircle.Label><ProgressCircle.Value /></ProgressCircle.Root>;
}
