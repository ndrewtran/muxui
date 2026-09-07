import { TagSelect } from "@muxui/react";

const tags = [{ id: "react", label: "React" }, { id: "css", label: "CSS" }];

export function BasicTagSelectExample() {
  return <TagSelect.Root label="Tags" items={tags} placeholder="Add a tag">{(item) => item.label}</TagSelect.Root>;
}
