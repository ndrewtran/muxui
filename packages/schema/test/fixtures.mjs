export function tokenSource() {
  return {
    schemaVersion: '2.1.0',
    id: 'muxui:token:default-theme',
    kind: 'token',
    name: 'Button minimum tokens',
    summary: 'The minimum token source used by the G0.1 proof artifact.',
    lifecycle: 'experimental',
    tokenContractVersion: '1.1.0',
    theme: {
      name: 'default',
      modeAxes: {
        colorScheme: ['light', 'dark'],
        contrast: ['standard', 'more'],
        motion: ['full', 'reduced'],
        density: ['comfortable', 'compact'],
        direction: ['ltr', 'rtl'],
      },
      defaultModes: {
        colorScheme: 'light',
        contrast: 'standard',
        motion: 'full',
        density: 'comfortable',
        direction: 'ltr',
      },
      runtimeSwitching: 'unavailable',
    },
    tokens: {
      'reference.color.black': {
        layer: 'reference',
        type: 'color',
        unit: 'hex',
        meaning: 'Black reference value.',
        overridePolicy: 'fixed',
        value: '#000000',
      },
      'semantic.action.background': {
        layer: 'semantic',
        type: 'color',
        unit: 'hex',
        meaning: 'Immediate action background.',
        overridePolicy: 'theme',
        alias: 'reference.color.black',
      },
    },
  };
}

function required(id) {
  return { id, disposition: 'required' };
}

function notApplicable(id, reason) {
  return { id, disposition: 'not-applicable', reason };
}

export function webPlatformSafety(profile) {
  return [{
    profile,
    requirements: [
      required('system.forced-colors'),
      required('system.high-contrast'),
      notApplicable('native.dynamic-color', 'Native dynamic colors do not apply to web.'),
      notApplicable('native.font-metrics', 'Native font metrics do not apply to web.'),
      required('layout.direction'),
      required('platform.accessibility-mapping'),
    ],
  }];
}

export function nativePlatformSafety() {
  const supported = (profile, validationProfile) => ({
    profile,
    validationProfile,
    requirements: [
      notApplicable('system.forced-colors', 'Web forced colors do not apply to native.'),
      notApplicable('system.high-contrast', 'Web high contrast does not apply to native.'),
      required('native.dynamic-color'),
      required('native.font-metrics'),
      required('layout.direction'),
      required('platform.accessibility-mapping'),
    ],
  });
  return [
    supported('ios', 'native.ios'),
    supported('android', 'native.android'),
    {
      profile: 'native.react-native-web',
      validationProfile: 'native.react-native-web',
      requirements: [
        'system.forced-colors',
        'system.high-contrast',
        'native.dynamic-color',
        'native.font-metrics',
        'layout.direction',
        'platform.accessibility-mapping',
      ].map((id) => notApplicable(id, 'The runtime profile is unsupported in G1.0.')),
    },
  ];
}

function webBinding(profile = 'web.react') {
  return {
    schemaVersion: '2.0.0',
    lifecycle: 'experimental',
    strategy: 'direct',
    api: {
      props: ['disabled'],
      events: ['activate'],
      parts: ['root', 'label'],
      defaults: { disabled: false },
    },
    behavior: ['Activation requests one immediate action'],
    accessibility: ['Expose accessible name and disabled state'],
    tokenRecipe: {
      source: 'muxui:token:default-theme',
      requirements: [{ token: 'semantic.action.background', requirement: 'required' }],
    },
    platformSafety: webPlatformSafety(profile),
    runtimeProfiles: {},
  };
}

export function component() {
  return {
    schemaVersion: '1.0.0',
    id: 'muxui:component:button',
    kind: 'component',
    name: 'Button',
    summary: 'Triggers an immediate action.',
    lifecycle: 'experimental',
    intent: {
      useWhen: ['Triggering an immediate action'],
      avoidWhen: ['Navigating to another location'],
    },
    anatomy: ['root', 'label'],
    states: ['idle', 'disabled'],
    accessibility: {
      nameRequired: true,
      obligations: ['Expose disabled state'],
    },
    bindings: {
      'web.html': webBinding('web.html'),
      'web.react': webBinding('web.react'),
      'native.react-native': {
        ...webBinding(),
        strategy: 'adapted',
        platformSafety: nativePlatformSafety(),
        runtimeProfiles: {
          ios: {
            strategy: 'adapted',
            lifecycle: 'experimental',
            validationProfile: 'native.ios',
          },
          android: {
            strategy: 'adapted',
            lifecycle: 'experimental',
            validationProfile: 'native.android',
          },
          'native.react-native-web': {
            strategy: 'unsupported',
            reason: 'No responsible implementation in the first proof artifact.',
          },
        },
      },
    },
  };
}

export function example({ guidanceImpact = 'normative', purposes = ['generation'] } = {}) {
  return {
    schemaVersion: '1.0.0',
    id: 'muxui:example:button-basic-react',
    kind: 'example',
    name: 'Basic React Button',
    summary: 'The minimum React Button example.',
    lifecycle: 'experimental',
    binding: {
      ref: 'muxui:component:button#web.react',
      guidanceImpact,
      purposes,
      preference: 0,
    },
    complexity: 'minimal',
    prerequisites: [],
    source: 'catalog/components/button/examples/react/basic.tsx',
  };
}

export function guide() {
  return {
    schemaVersion: '1.0.0',
    id: 'muxui:guide:button-usage',
    kind: 'guide',
    name: 'Button usage',
    summary: 'Portable usage guidance for Button.',
    lifecycle: 'experimental',
    keywords: ['action', 'button'],
    platforms: ['web.html', 'web.react', 'native.react-native'],
    source: 'catalog/guides/button-usage.md',
  };
}

export function capability() {
  return {
    schemaVersion: '1.0.0',
    id: 'muxui:capability:query-baseline',
    kind: 'capability',
    name: 'Query baseline',
    summary: 'Schema-only declaration; query behavior remains unavailable.',
    lifecycle: 'experimental',
    availability: 'unavailable',
    policy: { effect: 'read-only', requiresConfirmation: false },
    availableOn: ['cli'],
  };
}

/** A second web.react component, so a pattern can compose two participants. */
export function gridList() {
  return { ...component(), id: 'muxui:component:grid-list', name: 'GridList' };
}

/** A binding-less example: it is owned by the pattern that lists it as a variant. */
export function variantExample(slug = 'poster-grid-css') {
  const { binding: _binding, ...record } = example();
  return {
    ...record,
    id: `muxui:example:${slug}`,
    name: 'CSS grid',
    summary: 'GridList grid layout.',
    complexity: 'representative',
    source: `catalog/patterns/poster-grid/examples/react/${slug}.tsx`,
  };
}

export function pattern() {
  return {
    schemaVersion: '1.0.0',
    id: 'muxui:pattern:poster-grid',
    kind: 'pattern',
    name: 'Poster grid',
    summary: 'A scrollable grid of poster tiles with selection.',
    lifecycle: 'experimental',
    keywords: ['grid', 'gallery'],
    platforms: ['web.react'],
    category: 'collections',
    intent: {
      useWhen: ['Browsing many image-led items'],
      avoidWhen: ['Rows need sortable columns'],
    },
    participants: [
      { role: 'list', component: 'muxui:component:grid-list', requirement: 'required' },
      { role: 'action', component: 'muxui:component:button', requirement: 'optional' },
    ],
    variants: [{ example: 'muxui:example:poster-grid-css' }],
    accessibility: ['Tiles expose grid semantics and a visible focus ring.'],
    unsupported: ['Drag reordering'],
    workflowValue: 'Replaces hand-assembling GridList layout props.',
  };
}

/** Provisional relations, invariants, and parameters (experimental, owned by G2.4). */
export function specifiedPattern() {
  return {
    ...pattern(),
    relations: [{ type: 'contains', source: 'list', target: 'action' }],
    invariants: [{ role: 'list', rule: 'exactly-one' }],
    parameters: {
      density: { type: 'enum', values: ['comfortable', 'compact'], default: 'comfortable' },
      selectable: { type: 'boolean', default: false },
    },
  };
}

export function patternRecords() {
  return [component(), gridList(), variantExample(), pattern(), tokenSource()];
}

export function allRecords() {
  return [component(), example(), guide(), capability(), tokenSource()];
}
