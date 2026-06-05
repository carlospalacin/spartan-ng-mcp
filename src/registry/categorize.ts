import type { RegistryComponent } from './schema.js';

/** Component category as defined by the registry schema. */
export type RegistryCategory = RegistryComponent['category'];

/**
 * Static name → category map.
 *
 * The Spartan Analog API does NOT return a component category, so it must be
 * derived from the component name. This map is the single source of truth shared
 * by the build-time generator (`scripts/generate-registry.ts`) and the runtime
 * registry refresh (`src/registry/refresh.ts`), so a runtime refresh can never
 * downgrade categories to `misc`.
 */
const CATEGORY_NAMES: Record<Exclude<RegistryCategory, 'misc'>, readonly string[]> = {
  form: [
    'input',
    'textarea',
    'select',
    'native-select',
    'checkbox',
    'radio-group',
    'switch',
    'slider',
    'combobox',
    'autocomplete',
    'input-otp',
    'input-group',
    'field',
    'form-field',
    'label',
    'calendar',
    'date-picker',
  ],
  action: ['button', 'button-group', 'toggle', 'toggle-group'],
  layout: ['card', 'separator', 'resizable', 'scroll-area', 'aspect-ratio', 'accordion', 'collapsible'],
  overlay: ['dialog', 'alert-dialog', 'sheet', 'popover', 'tooltip', 'hover-card'],
  menu: ['dropdown-menu', 'context-menu', 'menubar', 'command'],
  navigation: ['navigation-menu', 'tabs', 'breadcrumb', 'pagination', 'sidebar'],
  'data-display': ['avatar', 'badge', 'table', 'data-table', 'carousel', 'item'],
  feedback: ['alert', 'progress', 'skeleton', 'spinner', 'sonner', 'empty'],
  typography: ['icon', 'kbd', 'typography'],
};

/** Resolve a component's category from its name. Falls back to `misc`. */
export function categorize(name: string): RegistryCategory {
  for (const [cat, names] of Object.entries(CATEGORY_NAMES)) {
    if (names.includes(name)) return cat as RegistryCategory;
  }
  return 'misc';
}
