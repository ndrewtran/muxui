import React from 'react';
import type { ReactNode } from 'react';
import { I18nProvider, RouterProvider } from 'react-aria-components';

/** The props Mux UI defines for MuxProvider. */
export type MuxProviderProps = {
  /**
   * The BCP 47 language tag components format numbers and dates in and read their text direction from, such as `de-DE`
   * or `ar-EG`. Pass the same value on the server and the client so the markup hydrates unchanged. Without it,
   * components render `en-US` on the server and switch to the browser's language after hydration.
   */
  locale?: string;
  /**
   * Opens the `href` of a `Link` or a breadcrumb in place of a browser navigation. Pass a router's navigate function so
   * those links change the route without a page load. Modified clicks, such as opening in a new tab, still reach the
   * browser.
   */
  navigate?: (href: string) => void;
  /** Turns a link's `href` into the URL the browser shows, such as a router's base path joined to it. It runs as a hook. */
  useHref?: (href: string) => string;
  children?: ReactNode;
};

/**
 * Sets the application-wide context Mux UI components read: the locale and, optionally, the router. It renders no
 * element, so place it once near the root, inside the document body. The page still owns `<html lang dir>`.
 */
export function MuxProvider(props: MuxProviderProps): ReactNode {
  const { locale, navigate, useHref, children } = props;
  const localized = React.createElement(I18nProvider, { locale, children });
  return navigate ? React.createElement(RouterProvider, { navigate, useHref, children: localized }) : localized;
}
