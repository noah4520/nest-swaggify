import { INestApplication, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from "@nestjs/common/constants";
import { OpenAPIObject } from "@nestjs/swagger";
import {
  SWAGGER_INCLUDE,
  SWAGGER_INCLUDE_ONLY,
  SWAGGER_EXCLUDE,
} from "../decorators/swagger-group.decorator";
import { NestApp, ResolvedMetadata } from "../interfaces/types";
import "reflect-metadata";

const OPENAPI_HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

function httpMethodsForCode(code: number): string[] {
  const name = RequestMethod[code]?.toLowerCase();
  if (!name) return [];
  if (name === "all") return OPENAPI_HTTP_METHODS;
  return [name];
}

function firstPath(value: unknown): string | undefined {
  const path = Array.isArray(value) ? value[0] : value;
  return typeof path === "string" ? path : undefined;
}

function normalizePath(p: string | undefined): string {
  if (!p || p === "/") return "";
  return p.startsWith("/") ? p.slice(1) : p;
}

function joinPath(controllerPath: string, methodPath: string): string {
  const segments = [controllerPath, methodPath].filter(Boolean);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function toOpenApiPath(p: string): string {
  return p
    .replace(/:([A-Za-z0-9_]+)\([^)]*\)/g, "{$1}")
    .replace(/:([A-Za-z0-9_]+)\??/g, "{$1}")
    .replace(/\*([A-Za-z0-9_]+)/g, "{$1}")
    .replace(/\/\*$/, "/{path}");
}

/**
 * Reads the URI version(s) declared on the handler (or, failing that, the
 * controller). Used to disambiguate suffix matches when URI versioning is on.
 */
function versionsOf(handler: object, controller: object): string[] {
  const value =
    Reflect.getMetadata(VERSION_METADATA, handler) ??
    Reflect.getMetadata(VERSION_METADATA, controller);
  if (value === undefined) return [];
  const values: unknown[] = Array.isArray(value) ? value : [value];
  // VERSION_NEUTRAL is a symbol; only string versions map to a URI segment.
  return values.filter((v): v is string => typeof v === "string");
}

/**
 * Finds the document path(s) a route resolves to. Exact match first; when the
 * app uses a global prefix or URI versioning the document paths carry leading
 * segments the route metadata doesn't know about, so fall back to
 * segment-aligned suffix matching, then narrow by declared version and by the
 * shortest leading remainder.
 */
function resolveDocumentPaths(
  documentPaths: string[],
  candidate: string,
  versions: string[],
): string[] {
  if (documentPaths.includes(candidate)) return [candidate];
  // "/" as a suffix would match nothing meaningful; a prefixed root route
  // (e.g. "/api") is indistinguishable from the prefix itself.
  if (candidate === "/") return [];

  // candidate always starts with "/", so endsWith implies a segment boundary.
  let matches = documentPaths.filter((p) => p.length > candidate.length && p.endsWith(candidate));
  if (matches.length <= 1) return matches;

  if (versions.length > 0) {
    const byVersion = matches.filter((p) => {
      const lastSegment = p.slice(0, -candidate.length).split("/").filter(Boolean).pop();
      return (
        lastSegment !== undefined &&
        versions.some((v) => lastSegment === v || lastSegment === `v${v}`)
      );
    });
    if (byVersion.length > 0) matches = byVersion;
  }
  if (matches.length <= 1) return matches;

  // A single global prefix is shorter than prefix + extra segments, so prefer
  // the matches with the least unexplained leading path.
  const minRemainder = Math.min(...matches.map((p) => p.length - candidate.length));
  return matches.filter((p) => p.length - candidate.length === minRemainder);
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
    // Failing silently here would disable all group filtering without any
    // visible symptom, so refuse to continue instead.
    throw new Error(
      "[Swaggify] Unable to access the Nest application's module container. " +
        "Group filtering cannot work — this NestJS version is likely incompatible with nest-swaggify.",
    );
  }

  const documentPaths = Object.keys(document.paths);

  for (const module of modulesContainer.values()) {
    if (!module.controllers) continue;

    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype;
      if (!controller) continue;

      const controllerName = (controller as { name?: string }).name || "Unknown";
      const controllerPath = normalizePath(
        firstPath(Reflect.getMetadata(PATH_METADATA, controller)),
      );
      const controllerMeta = resolveMetadata(controller, controllerName);

      const basePrototype = controller.prototype as Record<string, unknown> | undefined;
      if (!basePrototype || typeof basePrototype !== "object") continue;

      // Walk the prototype chain so routes inherited from a base controller
      // are picked up too; own members win over inherited ones.
      const seenMethods = new Set<string>();
      for (
        let prototype: object | null = basePrototype;
        prototype && prototype !== Object.prototype;
        prototype = Object.getPrototypeOf(prototype)
      ) {
        for (const methodName of Object.getOwnPropertyNames(prototype)) {
          if (methodName === "constructor" || seenMethods.has(methodName)) continue;
          seenMethods.add(methodName);

          // Read via descriptor so accessor properties are not invoked.
          const handler = Object.getOwnPropertyDescriptor(prototype, methodName)?.value;
          if (typeof handler !== "function") continue;

          const httpMethodCode = Reflect.getMetadata(METHOD_METADATA, handler) as
            | number
            | undefined;
          if (httpMethodCode === undefined) continue; // Not a route handler

          const methodPath = normalizePath(firstPath(Reflect.getMetadata(PATH_METADATA, handler)));
          const methodMeta = resolveMetadata(handler as object, `${controllerName}.${methodName}`);
          const finalMeta = mergeMetadata(controllerMeta, methodMeta);

          const candidatePath = toOpenApiPath(joinPath(controllerPath, methodPath));
          const versions = versionsOf(handler as object, controller);
          const matchedPaths = resolveDocumentPaths(documentPaths, candidatePath, versions);

          if (matchedPaths.length > 1) {
            // An undecorated handler resolves to "default" either way, so the
            // ambiguity is only worth surfacing when it can change a group.
            if (finalMeta.type !== "default") {
              console.warn(
                `[Swagger] ${controllerName}.${methodName}: route "${candidatePath}" matches ` +
                  `multiple document paths (${matchedPaths.join(", ")}); ` +
                  `applying its group metadata to all of them`,
              );
            } else {
              continue;
            }
          }

          for (const swaggerPath of matchedPaths) {
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

    for (const [httpMethod, operation] of Object.entries(pathItem as Record<string, unknown>)) {
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
