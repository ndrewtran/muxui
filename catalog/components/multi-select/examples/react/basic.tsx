import { MultiSelect } from "@muxui/react";

const options = [{ id: "react", label: "React" }, { id: "css", label: "CSS" }];

export function BasicMultiSelectExample() {
  return <MultiSelect.Root label="Technologies" items={options}>{(item) => <MultiSelect.Item id={item.id} textValue={item.label}>{item.label}</MultiSelect.Item>}</MultiSelect.Root>;
}
