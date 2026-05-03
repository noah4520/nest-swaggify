import { INestApplication, RequestMethod } from "@nestjs/common";
import { OpenAPIObject } from "@nestjs/swagger";
import {
  SWAGGER_INCLUDE,
  SWAGGER_INCLUDE_ONLY,
  SWAGGER_EXCLUDE,
} from "../decorators/swagger-group.decorator";
import { NestApp, ResolvedMetadata } from "../interfaces/types";
import "reflect-metadata";

// @All() registers a handler for every standard HTTP method; expand it so each operation
// in the OpenAPI document gets its own metadata entry.
const ALL_HTTP_METHODS = ["get", "post", "put", "delete", "patch", "options", "head"];

function httpMethodsForCode(code: number): string[] {
  const name = RequestMethod[code]?.toLowerCase();
  if (!name) return [];
  if (name === "all") return ALL_HTTP_METHODS;
  return [name];
}

function normalizePath(p: string | undefined): string {
  if (!p || p === "/") return "";
  return p.startsWith("/") ? p.slice(1) : p;
}

function joinPath(controllerPath: string, methodPath: string): string {
  const segments = [controllerPath, methodPath].filter(Boolean);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/**
 * Resolves conflicts between multiple decorators on the same target
 * Priority: exclude > include-only > include
 */
function resolveMetadata(target: object, targetName: string): ResolvedMetadata {
  const excludeFlag = Reflect.getMetadata(SWAGGER_EXCLUDE, target) as boolean | undefined;
  const includeOnlyGroups = Reflect.getMetadata(SWAGGER_INCLUDE_ONLY, target) as
    | string[]
    | undefined;
  const includeGroups = Reflect.getMetadata(SWAGGER_INCLUDE, target) as string[] | undefined;

  const hasExclude = excludeFlag === true;
  const hasIncludeOnly = Array.isArray(includeOnlyGroups) && includeOnlyGroups.length > 0;
  const hasInclude = Array.isArray(includeGroups) && includeGroups.length > 0;

  if (hasExclude) {
    if (hasIncludeOnly || hasInclude) {
      console.warn(`[Swagger] ${targetName}: @SwaggerExclude will override other decorators`);
    }
    return { type: "exclude", groups: [] };
  }

  if (hasIncludeOnly) {
    if (hasInclude) {
      console.warn(
        `[Swagger] ${targetName}: @SwaggerIncludeOnly conflicts with @SwaggerInclude, IncludeOnly will be used`,
      );
    }
    return {
      type: "include-only",
      groups: includeOnlyGroups!,
    };
  }

  if (hasInclude) {
    return {
      type: "include",
      groups: includeGroups!,
    };
  }

  return { type: "default", groups: [] };
}

/**
 * Merges Controller and Method level metadata
 * Method level settings take priority over Controller level
 */
function mergeMetadata(controller: ResolvedMetadata, method: ResolvedMetadata): ResolvedMetadata {
  if (method.type === "default") {
    return controller;
  }

  if (
    controller.type === method.type &&
    (method.type === "include" || method.type === "include-only")
  ) {
    const mergedGroups = [...new Set([...controller.groups, ...method.groups])];
    return {
      type: method.type,
      groups: mergedGroups,
    };
  }

  return method;
}

/**
 * Returns true if the metadata indicates this path should be included in targetGroup
 */
function shouldIncludeInGroup(meta: ResolvedMetadata, targetGroup: string): boolean {
  return (
    (meta.type === "include" || meta.type === "include-only") && meta.groups.includes(targetGroup)
  );
}

/**
 * Collects group metadata for all API paths
 * Scans decorators on all Controllers and Methods
 */
export function collectAllGroups(
  app: INestApplication,
  document: OpenAPIObject,
): Map<string, ResolvedMetadata> {
  const pathMetadataMap = new Map<string, ResolvedMetadata>();
  const nestApp = app as unknown as NestApp;
  const modulesContainer = nestApp.container?.getModules();

  if (!modulesContainer) {
    console.warn("[Swagger] Unable to get ModulesContainer, will only generate full docs");
    return pathMetadataMap;
  }

  for (const module of modulesContainer.values()) {
    if (!module.controllers) continue;

    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype;
      if (!controller) continue;

      const controllerName = (controller as { name?: string }).name || "Unknown";
      const controllerPath = normalizePath(
        Reflect.getMetadata("path", controller) as string | undefined,
      );
      const controllerMeta = resolveMetadata(controller, controllerName);

      const prototype = controller.prototype as Record<string, unknown> | undefined;
      if (!prototype || typeof prototype !== "object") continue;

      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        if (methodName === "constructor") continue;

        const handler = prototype[methodName];
        if (typeof handler !== "function") continue;

        const httpMethodCode = Reflect.getMetadata("method", handler) as number | undefined;
        if (httpMethodCode === undefined) continue; // Not a route handler

        const methodPath = normalizePath(
          Reflect.getMetadata("path", handler) as string | undefined,
        );
        const methodMeta = resolveMetadata(handler as object, `${controllerName}.${methodName}`);
        const finalMeta = mergeMetadata(controllerMeta, methodMeta);

        // Nest uses ":param"; OpenAPI uses "{param}".
        const swaggerPath = joinPath(controllerPath, methodPath).replace(/:(\w+)/g, "{$1}");
        const pathItem = document.paths[swaggerPath];
        if (!pathItem) continue;

        for (const httpMethod of httpMethodsForCode(httpMethodCode)) {
          if (!pathItem[httpMethod as keyof typeof pathItem]) continue;
          pathMetadataMap.set(`${httpMethod}:${swaggerPath}`, {
            type: finalMeta.type,
            groups: finalMeta.groups,
          });
        }
      }
    }
  }

  return pathMetadataMap;
}

/**
 * Filters a Swagger document for the full ("all") view: hides endpoints
 * marked with `@SwaggerExclude` or `@SwaggerIncludeOnly`. Default- and
 * include-typed endpoints are kept.
 */
export function filterDocumentForAll(
  document: OpenAPIObject,
  pathMetadataMap: Map<string, ResolvedMetadata>,
): OpenAPIObject {
  const filteredPaths: Record<string, OpenAPIObject["paths"][string]> = {};

  for (const [apiPath, pathItem] of Object.entries(document.paths)) {
    const filteredItem: Record<string, unknown> = {};
    let kept = false;

    for (const [httpMethod, operation] of Object.entries(
      pathItem as Record<string, unknown>,
    )) {
      if (operation === undefined || operation === null) continue;

      const meta = pathMetadataMap.get(`${httpMethod}:${apiPath}`);
      if (meta && (meta.type === "exclude" || meta.type === "include-only")) {
        continue;
      }

      filteredItem[httpMethod] = operation;
      kept = true;
    }

    if (kept) {
      filteredPaths[apiPath] = filteredItem as OpenAPIObject["paths"][string];
    }
  }

  return {
    ...document,
    paths: filteredPaths,
  };
}

/**
 * Filters a Swagger document by group
 */
export function filterDocumentByGroupWithMetadata(
  document: OpenAPIObject,
  pathMetadataMap: Map<string, ResolvedMetadata>,
  targetGroup: string,
): OpenAPIObject {
  const filteredPaths: Record<string, OpenAPIObject["paths"][string]> = {};

  pathMetadataMap.forEach((meta, key) => {
    if (!shouldIncludeInGroup(meta, targetGroup)) return;

    const colonIndex = key.indexOf(":");
    const httpMethod = key.substring(0, colonIndex);
    const apiPath = key.substring(colonIndex + 1);

    const pathItem = document.paths[apiPath];
    if (!pathItem) return;

    const methodOperation = pathItem[httpMethod as keyof typeof pathItem];
    if (!methodOperation) return;

    if (!filteredPaths[apiPath]) {
      filteredPaths[apiPath] = {};
    }
    (filteredPaths[apiPath] as Record<string, unknown>)[httpMethod] = methodOperation;
  });

  return {
    ...document,
    paths: filteredPaths,
  };
}
