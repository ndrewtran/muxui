import { useId, useState } from 'react';
import { Button, Form, Select, Separator, Switch, Text, TextField } from '@muxui/react';

const initial = { name: 'Sample user', email: 'sample@example.com', language: 'English', zone: 'UTC', product: true, mentions: true, weekly: false, digest: 'Weekly' };
type Settings = typeof initial;

const languages = ['English', 'French', 'German'];
const zones = ['UTC', 'UTC+01:00', 'UTC+09:00', 'UTC-05:00'];
const digests = ['Daily', 'Weekly', 'Monthly'];

export function AccountSettingsSectionsExample() {
  const id = useId();
  // Local presentation state only: nothing is fetched or persisted. Replace the submit handler with your save.
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [justSaved, setJustSaved] = useState(false);
  const edit = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setValues({ ...values, [key]: value });
    setJustSaved(false);
  };
  const choose = (key: 'language' | 'zone' | 'digest') => (value?: string) => {
    if (value !== undefined) edit(key, value);
  };
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  return (
    <div className="settings-frame">
      {/* The label column stacks above its fields, and the fields become one column, below 40rem of container width. */}
      <style>{`
        .settings-frame {
          container-type: inline-size;
          inline-size: 100%;
        }

        .settings-body {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-inset-large);
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset) var(--muxui-semantic-layout-inset-large);
        }

        .settings-section, .settings-fields {
          display: grid;
          gap: var(--muxui-semantic-layout-section-gap);
        }

        .settings-wide {
          grid-column: 1 / -1;
        }

        .settings-bar {
          position: sticky;
          inset-block-end: 0;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--muxui-semantic-layout-section-gap);
          padding: var(--muxui-semantic-layout-inset-medium) var(--muxui-semantic-layout-viewport-inset);
          background-color: var(--muxui-semantic-surface-canvas);
          border-block-start: 1px solid var(--muxui-semantic-border-default);
        }

        .settings-status {
          flex: 1 1 100%;
        }

        .settings-actions {
          display: flex;
          flex: 1 1 auto;
          gap: var(--muxui-semantic-layout-action-gap);
        }

        .settings-action {
          flex: 1 1 0;
        }

        @container (min-width: 40rem) {
          .settings-body, .settings-bar {
            padding-inline: var(--muxui-semantic-layout-inset-xlarge);
          }

          .settings-section {
            grid-template-columns: minmax(0, 1fr) minmax(0, 2.5fr);
            gap: var(--muxui-semantic-layout-content-indent);
          }

          .settings-fields {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-content: start;
          }

          .settings-status, .settings-actions, .settings-action {
            flex: none;
          }
        }
      `}</style>
      <Form
        aria-labelledby={`${id}-title`}
        onSubmit={(event) => {
          // Keep the browser from submitting; this block never leaves the page.
          event.preventDefault();
          setSaved(values);
          setJustSaved(true);
        }}
      >
        <div className="settings-body">
          <Text as="h1" id={`${id}-title`} variant="heading" size="lg">Settings</Text>
          <Separator />
          <section className="settings-section" aria-labelledby={`${id}-profile`}>
            <div>
              <Text as="h2" id={`${id}-profile`} variant="title" size="md">Profile</Text>
              <Text as="p" size="sm" color="muted">How you appear to others.</Text>
            </div>
            <div className="settings-fields">
              <TextField label="Display name" name="name" description="Shown on your profile." value={values.name} onChange={(value) => edit('name', value)} />
              <TextField label="Email" name="email" type="email" description="Used for sign in and notices." value={values.email} onChange={(value) => edit('email', value)} />
              <Select label="Language" name="language" items={languages} value={values.language} onChange={choose('language')} />
              <Select label="Time zone" name="zone" items={zones} value={values.zone} onChange={choose('zone')} />
            </div>
          </section>
          <Separator />
          <section className="settings-section" aria-labelledby={`${id}-notifications`}>
            <div>
              <Text as="h2" id={`${id}-notifications`} variant="title" size="md">Notifications</Text>
              <Text as="p" size="sm" color="muted">What we email you about.</Text>
            </div>
            <div className="settings-fields">
              <Switch className="settings-wide" label="Product updates" name="product" description="New features and changes." selected={values.product} onChange={(selected) => edit('product', selected)} />
              <Switch className="settings-wide" label="Mentions" name="mentions" description="When someone mentions you." selected={values.mentions} onChange={(selected) => edit('mentions', selected)} />
              <Switch className="settings-wide" label="Weekly summary" name="weekly" description="A digest of recent activity." selected={values.weekly} onChange={(selected) => edit('weekly', selected)} />
              <Select label="Email digest" name="digest" items={digests} value={values.digest} onChange={choose('digest')} />
            </div>
          </section>
        </div>
        <div className="settings-bar">
          <Text className="settings-status" role="status">{dirty ? 'Unsaved changes' : justSaved ? 'Saved' : 'No changes'}</Text>
          <div className="settings-actions">
            <Button className="settings-action" variant="neutral" onActivate={() => { setValues(saved); setJustSaved(false); }}>Cancel</Button>
            <Button className="settings-action" type="submit">Save</Button>
          </div>
        </div>
      </Form>
    </div>
  );
}
