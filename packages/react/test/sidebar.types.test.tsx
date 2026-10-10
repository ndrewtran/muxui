import { createRef } from 'react';
import { Sidebar } from '@muxui/react';

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
void controlled;
void uncontrolled;

// @ts-expect-error A Section needs a visible label for its nested list.
const unlabelled = <Sidebar.Section><Sidebar.NavItem href="/">Home</Sidebar.NavItem></Sidebar.Section>;
// @ts-expect-error The collapsed callback receives a boolean.
const wrongCallback = <Sidebar.Provider onCollapsedChange={(collapsed: string) => void collapsed} />;
void unlabelled;
void wrongCallback;
