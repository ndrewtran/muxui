import { Disclosure, DisclosureGroup } from '@muxui/react';

export function BasicDisclosureGroupExample() {
  return <DisclosureGroup defaultExpandedIds={['overview']}>
    <Disclosure id="overview" title="Project overview">A concise summary of the current project.</Disclosure>
    <Disclosure id="activity" title="Recent activity">Review the latest design and engineering updates.</Disclosure>
  </DisclosureGroup>;
}
