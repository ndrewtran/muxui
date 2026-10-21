import { createRef } from 'react';
import { Menu, Sidebar } from '@muxui/react';

const toggleRef = createRef<HTMLButtonElement>();
const sectionRef = createRef<HTMLLIElement>();

const controlled = (
  <Sidebar.Provider collapsed={false} onCollapsedChange={(collapsed: boolean) => void collapsed} shortcut="b">
    <Sidebar.Toggle ref={toggleRef} size="sm" aria-label="Fold navigation" />
    <Sidebar.Root aria-label="Workspace">
      <Sidebar.NavList>
        <Sidebar.Section ref={sectionRef} label="Projects">
          <Sidebar.NavItem href="/overview">Overview</Sidebar.NavItem>
        </Sidebar.Section>
      </Sidebar.NavList>
    </Sidebar.Root>
  </Sidebar.Provider>
);
const uncontrolled = <Sidebar.Provider defaultCollapsed><Sidebar.Toggle /></Sidebar.Provider>;
// Category, block, and variant: entries nest through `items`, and each group is controlled or uncontrolled.
const nested = (
  <Sidebar.NavItem
    href="/catalog"
    expanded
    onExpandedChange={(expanded: boolean) => void expanded}
    items={[
      { id: 'button', label: 'Button', href: '/catalog/button', defaultExpanded: true, items: [{ label: 'Primary', href: '/catalog/button/primary', current: true }] },
      { label: <em>Group</em>, items: [{ label: 'Leaf', href: '/catalog/leaf' }] },
    ]}
  >
    Catalog
  </Sidebar.NavItem>
);
void controlled;
void uncontrolled;
void nested;

// @ts-expect-error A Section needs a visible label for its nested list.
const unlabelled = <Sidebar.Section><Sidebar.NavItem href="/">Home</Sidebar.NavItem></Sidebar.Section>;
// @ts-expect-error The collapsed callback receives a boolean.
const wrongCallback = <Sidebar.Provider onCollapsedChange={(collapsed: string) => void collapsed} />;
void unlabelled;
void wrongCallback;
// @ts-expect-error An entry without items is a link and needs an href.
const leafWithoutHref = <Sidebar.NavItem items={[{ label: 'Nowhere' }]}>Group</Sidebar.NavItem>;
// @ts-expect-error The expanded callback receives a boolean.
const wrongExpanded = <Sidebar.NavItem onExpandedChange={(expanded: string) => void expanded}>Group</Sidebar.NavItem>;
void leafWithoutHref;
void wrongExpanded;

const compact = <Sidebar.Root aria-label="Workspace" density="compact" />;
// @ts-expect-error Density is default or compact.
const wrongDensity = <Sidebar.Root aria-label="Workspace" density="dense" />;
void compact;
void wrongDensity;

// The Account options button opens the AccountMenu child, which takes Menu items or a list of items.
const accountRef = createRef<HTMLDivElement>();
const account = (
  <Sidebar.AccountCard name="Ada" email="ada@example.com" status="online">
    <Sidebar.AccountMenu ref={accountRef} className="account-menu" onAction={(item) => void item?.id}>
      <Menu.Item id="profile">Profile</Menu.Item>
      <Menu.Separator />
      <Menu.Item id="sign-out">Sign out</Menu.Item>
    </Sidebar.AccountMenu>
  </Sidebar.AccountCard>
);
const accountItems = <Sidebar.AccountMenu items={[{ id: 'profile', label: 'Profile' }]} />;
void account;
void accountItems;
// AccountMenu supports items, children, onAction and className, which the catalog record lists. Nothing else of Menu's list props reaches it.
// @ts-expect-error onSelect is not an AccountMenu prop; onAction reports the chosen item.
const accountSelect = <Sidebar.AccountMenu items={['Profile']} onSelect={() => undefined} />;
// @ts-expect-error The menu is not disabled on its own; the card owns its button.
const accountDisabled = <Sidebar.AccountMenu items={['Profile']} disabled />;
void accountSelect;
void accountDisabled;
// @ts-expect-error The card needs the name it shows.
const nameless = <Sidebar.AccountCard email="ada@example.com" />;
void nameless;
