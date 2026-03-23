import type { Config } from "tailwindcss";

/**
 * Tailwind preset for Supra Automation Builder.
 * Consumers extend their own tailwind config with this preset
 * to get the builder's styles working.
 *
 * Usage in consuming app's tailwind.config.ts:
 *   content: [..., './node_modules/@supra/automation-builder/dist/**/*.js']
 */
const config: Partial<Config> = {
  theme: {
    extend: {},
  },
};

export default config;
