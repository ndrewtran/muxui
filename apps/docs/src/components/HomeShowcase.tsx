import {
  Autocomplete,
  Button,
  Checkbox,
  ComboBox,
  Dialog,
  ProgressBar,
  Select,
  Switch,
  TextField,
  Toolbar,
  ToggleButton,
} from '@muxui/react';

const options = ['Alpha', 'Beta', 'Gamma'];

const showcaseItems = [
  { name: 'Button', href: '/components/button/', content: <Button size="sm">Save</Button> },
  { name: 'TextField', href: '/components/text-field/', content: <TextField label="Name" defaultValue="Ada" /> },
  { name: 'Select', href: '/components/select/', content: <Select label="Theme" items={options} defaultValue="Alpha" /> },
  { name: 'Toolbar', href: '/components/toolbar/', content: <Toolbar aria-label="Actions"><Button size="sm">Add</Button><Button size="sm" variant="ghost">More</Button></Toolbar> },
  { name: 'Autocomplete', href: '/components/autocomplete/', content: <Autocomplete label="Search" items={options} placeholder="Type to search" /> },
  { name: 'ComboBox', href: '/components/combo-box/', content: <ComboBox label="Category" items={options} placeholder="Choose one" /> },
  { name: 'Switch', href: '/components/switch/', content: <Switch label="Enabled" defaultSelected /> },
  { name: 'Dialog', href: '/components/dialog/', content: <Dialog title="Confirm action" trigger={<Button size="sm">Open</Button>}>Dialog content</Dialog> },
  { name: 'ProgressBar', href: '/components/progress-bar/', content: <ProgressBar label="Progress" value={72} /> },
  { name: 'ToggleButton', href: '/components/toggle-button/', content: <ToggleButton defaultSelected>Pin</ToggleButton> },
  { name: 'Checkbox', href: '/components/checkbox/', content: <Checkbox defaultChecked>Notify me</Checkbox> },
];

export default function HomeShowcase() {
  return (
    <div className="home-showcase not-content" aria-label="Component showcase">
      {showcaseItems.map((item) => (
        <div className="showcase-item" key={item.name}>
          <a className="showcase-name" href={item.href}>{item.name}</a>
          <span className="showcase-preview">{item.content}</span>
        </div>
      ))}
    </div>
  );
}
