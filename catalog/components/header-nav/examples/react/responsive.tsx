import { Button, HeaderNav } from '@muxui/react';

const links = [
  { href: '/docs', label: 'Docs' },
  { href: '/components', label: 'Components' },
  { href: '/blocks', label: 'Blocks' },
];
const currentHref = '/docs';

// Sign in is the application's own action, shared by both copies. A router-based app would call its navigate function here.
function signIn() {
  window.location.assign('/sign-in');
}

// One list of links fills the header and the drawer, each marking the current page.
const navigation = links.map(({ href, label }) => (
  <HeaderNav.NavButton key={href} href={href} current={href === currentHref}>{label}</HeaderNav.NavButton>
));

export function ResponsiveHeaderNavExample() {
  return (
    <div className="header-frame">
      {/* From 40rem wide the links and Sign in show; below it the drawer trigger shows, and the drawer holds both. */}
      <style>{`
        .header-frame {
          container-type: inline-size;
          inline-size: 100%;
        }

        .header-links,
        .header-actions {
          display: none;
        }

        .header-drawer-actions {
          padding: var(--muxui-semantic-layout-inset-small);
        }

        @container (min-width: 40rem) {
          .header-links,
          .header-actions {
            display: flex;
          }

          .header-menu {
            display: none;
          }
        }
      `}</style>
      <HeaderNav.Root>
        <HeaderNav.Logo href="/">Mux</HeaderNav.Logo>
        <HeaderNav.Secondary className="header-links">{navigation}</HeaderNav.Secondary>
        <HeaderNav.Actions className="header-actions">
          <Button onActivate={signIn}>Sign in</Button>
        </HeaderNav.Actions>
        <div className="header-menu">
          <HeaderNav.MobileTrigger>
            {navigation}
            {/* The essential action that no longer fits in the header follows the links. */}
            <div className="header-drawer-actions">
              <Button onActivate={signIn}>Sign in</Button>
            </div>
          </HeaderNav.MobileTrigger>
        </div>
      </HeaderNav.Root>
    </div>
  );
}
