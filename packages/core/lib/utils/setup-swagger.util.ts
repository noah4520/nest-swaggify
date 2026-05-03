import { INestApplication } from "@nestjs/common";
import { SwaggerModule, OpenAPIObject } from "@nestjs/swagger";
import {
  collectAllGroups,
  filterDocumentByGroupWithMetadata,
  filterDocumentForAll,
} from "./swagger-filter.util";

interface SwaggerFilterOptions {
  /**
   * Environment variable name used to specify the group to filter
   * @default 'SWAGGER_GROUP'
   */
  groupEnvVar?: string;

  /**
   * Whether to print logs to the console
   * @default true
   */
  verbose?: boolean;

  /**
   * Behavior when no APIs are found after filtering
   * - 'warn': Show warning and fall back to full docs
   * - 'error': Throw an error
   * - 'silent': Silently use empty docs
   * @default 'warn'
   */
  onEmptyResult?: "warn" | "error" | "silent";
}

export interface SetupSwaggerOptions extends SwaggerFilterOptions {
  /**
   * Path for the Swagger UI
   * @default 'api'
   */
  path?: string;
}

export interface CreateSwaggerDocumentOptions extends SwaggerFilterOptions {
  /**
   * Specify the group to filter (takes priority over environment variable)
   * If 'all' or unspecified, returns the full document with `@SwaggerExclude`
   * and `@SwaggerIncludeOnly` endpoints hidden.
   */
  group?: string;
}

/**
 * Applies group filtering to a Swagger document.
 * In `all` mode, hides endpoints marked with `@SwaggerExclude` or
 * `@SwaggerIncludeOnly`; in group mode, returns only endpoints in that group.
 */
function resolveFilteredDocument(
  app: INestApplication,
  document: OpenAPIObject,
  swaggerGroup: string,
  verbose: boolean,
  onEmptyResult: "warn" | "error" | "silent",
): OpenAPIObject {
  const pathMetadataMap = collectAllGroups(app, document);

  if (swaggerGroup === "all") {
    if (verbose) {
      console.log("[Swaggify] Mode: showing full API (all)");
    }
    return filterDocumentForAll(document, pathMetadataMap);
  }

  if (verbose) {
    console.log(`[Swaggify] Filter mode: showing only APIs in group "${swaggerGroup}"`);
  }

  const filteredDocument = filterDocumentByGroupWithMetadata(
    document,
    pathMetadataMap,
    swaggerGroup,
  );

  const apiCount = Object.keys(filteredDocument.paths).length;

  if (apiCount === 0) {
    const message = `No APIs found for group "${swaggerGroup}"`;
    if (onEmptyResult === "error") {
      throw new Error(`[Swaggify] ${message}`);
    }
    if (onEmptyResult === "warn") {
      console.warn(`[Swaggify] ${message}, falling back to full docs`);
      return filterDocumentForAll(document, pathMetadataMap);
    }
    return filteredDocument;
  }

  if (verbose) {
    console.log(`[Swaggify] Found ${apiCount} API(s)`);
  }
  return filteredDocument;
}

/**
 * Sets up Swagger UI with group filtering driven by an env var.
 *
 * @example
 * ```typescript
 * setupSwagger(app, config, { path: 'api-docs', groupEnvVar: 'SWAGGER_GROUP' });
 * ```
 */
export function setupSwagger(
  app: INestApplication,
  config: Omit<OpenAPIObject, "paths">,
  options: SetupSwaggerOptions = {},
): void {
  const {
    path = "api",
    groupEnvVar = "SWAGGER_GROUP",
    verbose = true,
    onEmptyResult = "warn",
  } = options;

  const document = SwaggerModule.createDocument(app, config);
  const swaggerGroup = process.env[groupEnvVar] ?? "all";
  const finalDocument = resolveFilteredDocument(
    app,
    document,
    swaggerGroup,
    verbose,
    onEmptyResult,
  );

  SwaggerModule.setup(path, app, finalDocument);

  if (verbose) {
    console.log(`[Swaggify] Swagger UI enabled at path: /${path}`);
  }
}

/**
 * Returns a filtered Swagger document without registering any UI.
 * Use when you need manual control over `SwaggerModule.setup`.
 */
export function createSwaggerDocumentWithGroup(
  app: INestApplication,
  config: Omit<OpenAPIObject, "paths">,
  options: CreateSwaggerDocumentOptions = {},
): OpenAPIObject {
  const { group, groupEnvVar = "SWAGGER_GROUP", verbose = true, onEmptyResult = "warn" } = options;

  const document = SwaggerModule.createDocument(app, config);
  const swaggerGroup = group ?? process.env[groupEnvVar] ?? "all";
  return resolveFilteredDocument(app, document, swaggerGroup, verbose, onEmptyResult);
}
