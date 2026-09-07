import { ProgressCircle } from "@muxui/react";

export function BasicProgressCircleExample() {
  return <ProgressCircle.Root value={65} label="Upload progress"><ProgressCircle.Track /><ProgressCircle.Value /></ProgressCircle.Root>;
}
