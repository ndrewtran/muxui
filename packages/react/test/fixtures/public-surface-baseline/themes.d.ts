export type MuxUIThemeCollection = 'standard' | 'monochrome';
export type MuxUIStandardThemeId = 'standard-harbour' | 'standard-lagoon' | 'standard-blueprint' | 'standard-violet-dusk' | 'standard-wildflower' | 'standard-terracotta' | 'standard-amber-grove' | 'standard-fern';
export type MuxUIMonochromeThemeId = 'monochrome-antique' | 'monochrome-forest' | 'monochrome-mauve' | 'monochrome-mountain-meadow' | 'monochrome-rosewater' | 'monochrome-teal' | 'monochrome-terracotta';
export type MuxUIThemeId = MuxUIStandardThemeId | MuxUIMonochromeThemeId;
export interface MuxUIThemeSwatch { readonly primary: string; readonly secondary: string; }
export interface MuxUIThemePreset { readonly id: MuxUIThemeId; readonly presetId: string; readonly name: string; readonly description: string; readonly collection: MuxUIThemeCollection; readonly swatch: MuxUIThemeSwatch; }
export declare const MUXUI_THEME_PRESETS: readonly MuxUIThemePreset[];
export declare const MUXUI_THEME_PRESETS_BY_ID: Readonly<Record<MuxUIThemeId, MuxUIThemePreset>>;
export declare const MUXUI_DEFAULT_THEME_PRESET_ID: MuxUIThemeId;
