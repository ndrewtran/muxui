// The per-icon Lucide modules TypeScript sources import (the Lucide guard test keeps
// every import on one of them) carry no declarations of their own. Each default-exports
// one icon component. Only the build reads this file; no shipped declaration names Lucide.
declare module 'lucide-react/dist/esm/icons/*.mjs' {
  import type { LucideIcon } from 'lucide-react';

  const icon: LucideIcon;
  export default icon;
}
