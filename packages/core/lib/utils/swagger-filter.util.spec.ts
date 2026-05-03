import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { All, Controller, Delete, Get, Post } from "@nestjs/common";
import {
  collectAllGroups,
  filterDocumentByGroupWithMetadata,
  filterDocumentForAll,
} from "./swagger-filter.util";
import {
  SwaggerExclude,
  SwaggerInclude,
  SwaggerIncludeOnly,
} from "../decorators/swagger-group.decorator";
import type { ResolvedMetadata } from "../interfaces/types";
import type { INestApplication } from "@nestjs/common";
import type { OpenAPIObject } from "@nestjs/swagger";

function makeDocument(paths: Record<string, object>): OpenAPIObject {
  return {
    openapi: "3.0.0",
    info: { title: "Test", version: "1.0" },
    paths,
  };
}

function makeMap(entries: [string, ResolvedMetadata][]): Map<string, ResolvedMetadata> {
  return new Map(entries);
}

// Minimal stub mimicking the parts of INestApplication that collectAllGroups touches.
function makeApp(controllers: Function[]): INestApplication {
  const moduleEntry = {
    controllers: {
      values: () => controllers.map((c) => ({ metatype: c }))[Symbol.iterator](),
    },
  };
  return {
    container: {
      getModules: () => ({
        values: () => [moduleEntry][Symbol.iterator](),
      }),
    },
  } as unknown as INestApplication;
}

const methodsOf = (paths: OpenAPIObject["paths"], path: string) =>
  paths[path] as Record<string, unknown> | undefined;

describe("filterDocumentByGroupWithMetadata", () => {
  it.each<{
    type: ResolvedMetadata["type"];
    groups: string[];
    target: string;
    included: boolean;
  }>([
    { type: "include", groups: ["public"], target: "public", included: true },
    { type: "include", groups: ["internal"], target: "public", included: false },
    { type: "include-only", groups: ["internal"], target: "internal", included: true },
    { type: "include-only", groups: ["internal"], target: "public", included: false },
    { type: "exclude", groups: [], target: "public", included: false },
    { type: "default", groups: [], target: "public", included: false },
  ])(
    "type=$type groups=$groups target=$target → included=$included",
    ({ type, groups, target, included }) => {
      const doc = makeDocument({ "/users": { get: {} } });
      const map = makeMap([["get:/users", { type, groups }]]);

      const result = filterDocumentByGroupWithMetadata(doc, map, target);

      if (included) {
        expect(methodsOf(result.paths, "/users")?.["get"]).toBeDefined();
        // Top-level document fields should pass through unchanged.
        expect(result.openapi).toBe("3.0.0");
        expect(result.info.title).toBe("Test");
      } else {
        expect(result.paths["/users"]).toBeUndefined();
      }
    },
  );

  it("includes only the matched HTTP method when other methods on the same path aren't in the group", () => {
    const doc = makeDocument({
      "/users": { get: { operationId: "getUsers" }, post: { operationId: "createUser" } },
    });
    const map = makeMap([
      ["get:/users", { type: "include", groups: ["public"] }],
      ["post:/users", { type: "include-only", groups: ["internal"] }],
    ]);

    const result = filterDocumentByGroupWithMetadata(doc, map, "public");

    expect(methodsOf(result.paths, "/users")?.["get"]).toBeDefined();
    expect(methodsOf(result.paths, "/users")?.["post"]).toBeUndefined();
  });

  it("filters independently across multiple paths", () => {
    const doc = makeDocument({
      "/users": { get: {} },
      "/orders": { get: {} },
      "/admin": { get: {} },
    });
    const map = makeMap([
      ["get:/users", { type: "include", groups: ["public"] }],
      ["get:/orders", { type: "include", groups: ["public"] }],
      ["get:/admin", { type: "include-only", groups: ["internal"] }],
    ]);

    const result = filterDocumentByGroupWithMetadata(doc, map, "public");

    expect(result.paths["/users"]).toBeDefined();
    expect(result.paths["/orders"]).toBeDefined();
    expect(result.paths["/admin"]).toBeUndefined();
  });
});

describe("collectAllGroups", () => {
  it("does not let an overlapping controller path leak into a sibling (e.g. 'user' vs 'user-roles')", () => {
    // Regression: previously `apiPath.includes('/user')` matched '/user-roles',
    // so a non-decorated UserController could clobber UserRolesController's metadata.
    @Controller("user")
    class UserController {
      @Get()
      find() {}
    }

    @Controller("user-roles")
    @SwaggerInclude("public-api")
    class UserRolesController {
      @Get()
      list() {}
    }

    const doc = makeDocument({
      "/user": { get: {} },
      "/user-roles": { get: {} },
    });

    // Order both ways to confirm the result is no longer order-dependent.
    for (const order of [
      [UserRolesController, UserController],
      [UserController, UserRolesController],
    ]) {
      const meta = collectAllGroups(makeApp(order), doc);
      const filtered = filterDocumentByGroupWithMetadata(doc, meta, "public-api");

      expect(filtered.paths["/user-roles"]).toBeDefined();
      expect(filtered.paths["/user"]).toBeUndefined();
    }
  });

  it("does not let a root-path controller pull siblings into its group", () => {
    @Controller()
    @SwaggerInclude("public-api")
    class AppRootController {
      @Get()
      hello() {}
    }

    @Controller("orders")
    class OrdersController {
      @Get()
      list() {}
    }

    const doc = makeDocument({
      "/": { get: {} },
      "/orders": { get: {} },
    });

    for (const order of [
      [AppRootController, OrdersController],
      [OrdersController, AppRootController],
    ]) {
      const meta = collectAllGroups(makeApp(order), doc);
      const filtered = filterDocumentByGroupWithMetadata(doc, meta, "public-api");

      expect(filtered.paths["/"]).toBeDefined();
      expect(filtered.paths["/orders"]).toBeUndefined();
    }
  });

  it("falls back to controller-level decorator for methods without their own", () => {
    @Controller("posts")
    @SwaggerInclude("public-api")
    class PostsController {
      @Get()
      list() {}

      @SwaggerIncludeOnly("internal-api")
      @Post()
      create() {}
    }

    const doc = makeDocument({ "/posts": { get: {}, post: {} } });

    const meta = collectAllGroups(makeApp([PostsController]), doc);
    const publicDoc = filterDocumentByGroupWithMetadata(doc, meta, "public-api");
    const internalDoc = filterDocumentByGroupWithMetadata(doc, meta, "internal-api");

    expect(methodsOf(publicDoc.paths, "/posts")?.["get"]).toBeDefined();
    expect(methodsOf(publicDoc.paths, "/posts")?.["post"]).toBeUndefined();
    expect(methodsOf(internalDoc.paths, "/posts")?.["post"]).toBeDefined();
    expect(methodsOf(internalDoc.paths, "/posts")?.["get"]).toBeUndefined();
  });

  it("@SwaggerExclude on a method overrides controller @SwaggerInclude", () => {
    @Controller("orders")
    @SwaggerInclude("public-api")
    class OrdersController {
      @Get()
      list() {}

      @SwaggerExclude()
      @Delete("purge")
      purge() {}
    }

    const doc = makeDocument({
      "/orders": { get: {} },
      "/orders/purge": { delete: {} },
    });

    const meta = collectAllGroups(makeApp([OrdersController]), doc);
    const filtered = filterDocumentByGroupWithMetadata(doc, meta, "public-api");

    expect(methodsOf(filtered.paths, "/orders")?.["get"]).toBeDefined();
    expect(filtered.paths["/orders/purge"]).toBeUndefined();
  });

  it("@SwaggerExclude on a controller hides every route under it", () => {
    @Controller("internal")
    @SwaggerExclude()
    class InternalController {
      @Get()
      list() {}

      @Post()
      create() {}
    }

    const doc = makeDocument({ "/internal": { get: {}, post: {} } });

    const meta = collectAllGroups(makeApp([InternalController]), doc);

    for (const group of ["public-api", "internal-api"]) {
      expect(
        filterDocumentByGroupWithMetadata(doc, meta, group).paths["/internal"],
      ).toBeUndefined();
    }
  });

  describe("conflicting decorators on the same target", () => {
    // Source emits console.warn when conflicts are detected; silence it for these cases.
    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("exclude beats include-only and include", () => {
      @Controller("a")
      @SwaggerExclude()
      @SwaggerIncludeOnly("internal")
      @SwaggerInclude("public")
      class AController {
        @Get()
        list() {}
      }

      const doc = makeDocument({ "/a": { get: {} } });
      const meta = collectAllGroups(makeApp([AController]), doc);

      for (const group of ["public", "internal"]) {
        expect(filterDocumentByGroupWithMetadata(doc, meta, group).paths["/a"]).toBeUndefined();
      }
    });

    it("include-only beats include", () => {
      @Controller("b")
      @SwaggerIncludeOnly("internal")
      @SwaggerInclude("public")
      class BController {
        @Get()
        list() {}
      }

      const doc = makeDocument({ "/b": { get: {} } });
      const meta = collectAllGroups(makeApp([BController]), doc);

      // include-only wins → only "internal", not "public" (because include is dropped).
      expect(filterDocumentByGroupWithMetadata(doc, meta, "public").paths["/b"]).toBeUndefined();
      expect(filterDocumentByGroupWithMetadata(doc, meta, "internal").paths["/b"]).toBeDefined();
    });
  });

  it("converts ':param' to '{param}' so it matches the OpenAPI document", () => {
    @Controller("users")
    @SwaggerInclude("public-api")
    class UsersController {
      @Get(":id")
      find() {}
    }

    const doc = makeDocument({ "/users/{id}": { get: {} } });

    const meta = collectAllGroups(makeApp([UsersController]), doc);
    const filtered = filterDocumentByGroupWithMetadata(doc, meta, "public-api");

    expect(filtered.paths["/users/{id}"]).toBeDefined();
  });

  it("@All() expands to every standard HTTP method present in the document", () => {
    @Controller("anything")
    @SwaggerInclude("public-api")
    class AnythingController {
      @All()
      handle() {}
    }

    const doc = makeDocument({
      "/anything": {
        get: {},
        post: {},
        put: {},
        delete: {},
        patch: {},
        options: {},
        head: {},
      },
    });

    const meta = collectAllGroups(makeApp([AnythingController]), doc);
    const filtered = filterDocumentByGroupWithMetadata(doc, meta, "public-api");

    const item = methodsOf(filtered.paths, "/anything");
    for (const method of ["get", "post", "put", "delete", "patch", "options", "head"]) {
      expect(item?.[method]).toBeDefined();
    }
  });

  describe("multiple groups", () => {
    it("a method without its own decorator inherits every controller group", () => {
      @Controller("orders")
      @SwaggerInclude("public-api", "partner-api")
      class OrdersController {
        @Get()
        list() {}
      }

      const doc = makeDocument({ "/orders": { get: {} } });
      const meta = collectAllGroups(makeApp([OrdersController]), doc);

      for (const group of ["public-api", "partner-api"]) {
        expect(
          methodsOf(filterDocumentByGroupWithMetadata(doc, meta, group).paths, "/orders")?.["get"],
        ).toBeDefined();
      }
      expect(
        methodsOf(filterDocumentByGroupWithMetadata(doc, meta, "v2").paths, "/orders")?.["get"],
      ).toBeUndefined();
    });

    it("merges controller + method groups when both use the same decorator type", () => {
      @Controller("orders")
      @SwaggerInclude("public-api", "partner-api")
      class OrdersController {
        @SwaggerInclude("v2")
        @Post()
        create() {}
      }

      const doc = makeDocument({ "/orders": { post: {} } });
      const meta = collectAllGroups(makeApp([OrdersController]), doc);

      for (const group of ["public-api", "partner-api", "v2"]) {
        expect(
          methodsOf(filterDocumentByGroupWithMetadata(doc, meta, group).paths, "/orders")?.["post"],
        ).toBeDefined();
      }
    });

    it("@SwaggerIncludeOnly on a method drops the controller's groups", () => {
      @Controller("orders")
      @SwaggerInclude("public-api", "partner-api")
      class OrdersController {
        @SwaggerIncludeOnly("internal-api", "audit")
        @Delete("purge")
        purge() {}
      }

      const doc = makeDocument({ "/orders/purge": { delete: {} } });
      const meta = collectAllGroups(makeApp([OrdersController]), doc);

      for (const group of ["internal-api", "audit"]) {
        expect(
          methodsOf(filterDocumentByGroupWithMetadata(doc, meta, group).paths, "/orders/purge")?.[
            "delete"
          ],
        ).toBeDefined();
      }
      for (const group of ["public-api", "partner-api"]) {
        expect(
          filterDocumentByGroupWithMetadata(doc, meta, group).paths["/orders/purge"],
        ).toBeUndefined();
      }
    });
  });

  describe("filterDocumentForAll", () => {
    it("hides @SwaggerExclude endpoints from the full doc", () => {
      @Controller("orders")
      class OrdersController {
        @Get()
        list() {}

        @SwaggerExclude()
        @Delete("purge")
        purge() {}
      }

      const doc = makeDocument({
        "/orders": { get: {} },
        "/orders/purge": { delete: {} },
      });

      const meta = collectAllGroups(makeApp([OrdersController]), doc);
      const allDoc = filterDocumentForAll(doc, meta);

      expect(methodsOf(allDoc.paths, "/orders")?.["get"]).toBeDefined();
      expect(allDoc.paths["/orders/purge"]).toBeUndefined();
    });

    it("hides @SwaggerIncludeOnly endpoints from the full doc", () => {
      @Controller("admin")
      class AdminController {
        @Get()
        list() {}

        @SwaggerIncludeOnly("internal-api")
        @Post()
        create() {}
      }

      const doc = makeDocument({ "/admin": { get: {}, post: {} } });

      const meta = collectAllGroups(makeApp([AdminController]), doc);
      const allDoc = filterDocumentForAll(doc, meta);

      expect(methodsOf(allDoc.paths, "/admin")?.["get"]).toBeDefined();
      expect(methodsOf(allDoc.paths, "/admin")?.["post"]).toBeUndefined();
    });

    it("keeps default and @SwaggerInclude endpoints in the full doc", () => {
      @Controller("posts")
      class PostsController {
        @Get()
        list() {}

        @SwaggerInclude("public-api")
        @Post()
        create() {}
      }

      const doc = makeDocument({ "/posts": { get: {}, post: {} } });

      const meta = collectAllGroups(makeApp([PostsController]), doc);
      const allDoc = filterDocumentForAll(doc, meta);

      expect(methodsOf(allDoc.paths, "/posts")?.["get"]).toBeDefined();
      expect(methodsOf(allDoc.paths, "/posts")?.["post"]).toBeDefined();
    });

    it("drops a path entirely when every method on it is hidden", () => {
      @Controller("internal")
      @SwaggerExclude()
      class InternalController {
        @Get()
        list() {}

        @Post()
        create() {}
      }

      const doc = makeDocument({ "/internal": { get: {}, post: {} } });

      const meta = collectAllGroups(makeApp([InternalController]), doc);
      const allDoc = filterDocumentForAll(doc, meta);

      expect(allDoc.paths["/internal"]).toBeUndefined();
    });

    it("preserves top-level document fields", () => {
      const doc = makeDocument({ "/users": { get: {} } });
      const meta = makeMap([]);

      const allDoc = filterDocumentForAll(doc, meta);

      expect(allDoc.openapi).toBe("3.0.0");
      expect(allDoc.info.title).toBe("Test");
      expect(allDoc.paths["/users"]).toBeDefined();
    });
  });

  it("ignores prototype members that are not route handlers", () => {
    @Controller("things")
    @SwaggerInclude("public-api")
    class ThingsController {
      helper() {} // no @Get/@Post → should be skipped without throwing

      @Get()
      list() {}
    }

    const doc = makeDocument({ "/things": { get: {} } });

    const meta = collectAllGroups(makeApp([ThingsController]), doc);
    const filtered = filterDocumentByGroupWithMetadata(doc, meta, "public-api");

    expect(filtered.paths["/things"]).toBeDefined();
  });
});
