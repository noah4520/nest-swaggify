type ControllerClass = new () => unknown;

interface ModuleWrapper {
  metatype?: ControllerClass;
}

interface ControllerWrapper {
  values(): IterableIterator<ModuleWrapper>;
}

interface Module {
  controllers?: ControllerWrapper;
}

interface ModulesContainer {
  values(): IterableIterator<Module>;
}

export interface NestApp {
  container?: {
    getModules(): ModulesContainer;
  };
}

export interface ResolvedMetadata {
  type: "include" | "include-only" | "exclude" | "default";
  groups: string[];
}

/**
 * Type for the **CLI config file** (`swaggify.config.ts` / `swaggify.config.js`)
 * consumed by the `generate-swagger` CLI when emitting static Swagger JSON files.
 */
export interface SwaggifyCliConfig {
  /**
   * Application module path (required)
   * @example "./dist/app.module"
   */
  appModule?: string;

  /**
   * Output directory
   * @default "./swagger-output"
   * @example "./swagger-output"
   */
  output?: string;

  /**
   * Which groups to generate.
   * - Omit: generate full docs + every detected group
   * - `"all"`: generate the full doc only
   * - `string[]`: generate only the listed groups
   * @example ["public-api"]
   * @example ["public-api", "internal-api"]
   */
  group?: string[] | "all";

  /**
   * Base URL(s)
   * @default ["http://localhost:3000"]
   * @example "http://localhost:3000"
   * @example ["http://localhost:3000", "https://api.example.com"]
   */
  baseUrl?: string | string[];

  /**
   * API title
   * @default "API Documentation"
   * @example "My API"
   */
  title?: string;

  /**
   * API description
   * @default "Auto-generated API documentation"
   * @example "API Documentation"
   */
  description?: string;

  /**
   * API version
   * @default "1.0"
   * @example "1.0.0"
   */
  version?: string;
}
