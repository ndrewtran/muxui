import { HeaderNav } from '@muxui/react';

const links = [
  { href: '/docs', label: 'Docs' },
  { href: '/components', label: 'Components' },
  { href: '/blocks', label: 'Blocks' },
];
const currentHref = '/docs';

// One list of links fills the header and the drawer, each marking the current page.
const navigation = links.map(({ href, label }) => (
  <HeaderNav.NavButton key={href} href={href} current={href === currentHref}>{label}</HeaderNav.NavButton>
));

export function ResponsiveHeaderNavExample() {
  return (
    <div className="header-frame">
      {/* From 40rem wide the links show; below it the drawer trigger shows. */}
      <style>{`
        .header-frame {
          container-type: inline-size;
          inline-size: 100%;
        }

        .header-links {
          display: none;
        }

        @container (min-width: 40rem) {
          .header-links {
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
        <div className="header-menu">
          <HeaderNav.MobileTrigger>{navigation}</HeaderNav.MobileTrigger>
        </div>
      </HeaderNav.Root>
    </div>
  );
}
