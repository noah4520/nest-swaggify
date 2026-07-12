<p align="center">
  <img
    src="https://raw.githubusercontent.com/noah4520/nest-swaggify/main/assets/logo.png"
    alt="Nest Swaggify logo"
    width="200"
  />
</p>

<br/>

<p align="center">
  <a href="https://www.npmjs.com/package/nest-swaggify"><img src="https://img.shields.io/npm/v/nest-swaggify.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/nest-swaggify.svg" alt="node compatibility"></a>
  <a href="https://github.com/noah4520/nest-swaggify/actions/workflows/ci.yml"><img src="https://github.com/noah4520/nest-swaggify/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/noah4520/nest-swaggify.svg" alt="license"></a>
</p>

<br/>

# Nest Swaggify

**English** | [繁體中文](README.zh-TW.md)

A NestJS Swagger extension — split one API spec into multiple group-scoped docs via decorators, with runtime switching and static JSON output.

## 💡 Why Nest Swaggify?

Native `@nestjs/swagger` can't expose more than one Swagger doc out of a single service. Common situations where you need to:

- **Public API vs internal tools** — the same service serves external developers and internal admins, but each audience should see a different set of endpoints.
- **Multiple partner integrations** — the doc you give partner A shouldn't include partner B's endpoints, and vice versa.
- **Multiple API versions side by side** — v1 / v2 / v3 all live in the same service, but each deserves its own Swagger UI.
- **Multiple OpenAPI JSON outputs** — one codebase emits multiple OpenAPI specs, ready for whatever tools consume them.

Nest Swaggify lets you tag each endpoint with the groups it belongs to via decorators, then pick which group to serve at runtime via an env var, or emit one JSON per group via the CLI.

## ✨ Features

- 🪶 **Drop-in integration** — Keeps `@nestjs/swagger`'s `DocumentBuilder`; just swap `SwaggerModule.setup` for `setupSwagger`. Native decorators like `@ApiTags` and `@ApiOperation` keep working — nothing new to learn.
- 🎯 **Same decorator mechanism as Nest** — Built on Nest's native `SetMetadata`, so `@SwaggerInclude`, `@SwaggerIncludeOnly`, and `@SwaggerExclude` behave exactly like `@UseGuards` or `@ApiTags`. Apply them at the Controller or Method level to control which group each endpoint appears in.
- 🔀 **Runtime switching + static output** — Pick the served group at runtime via an env var; or run the `generate-swagger` CLI to emit Swagger JSON for any specified group.

## 📦 Installation

```bash
npm install nest-swaggify
```

## 🚀 Quick Start

### 1. Mark APIs with decorators

Tag a Controller or Method to declare which group it belongs to:

```typescript
import { Controller, Get } from "@nestjs/common";
import { SwaggerInclude } from "nest-swaggify";

@SwaggerInclude("public-api")
@Controller("users")
export class UsersController {
  @Get()
  findAll() {} // appears in the public-api group doc
}
```

For other decorators and behaviors, see the [API section](#-api).

### 2. Wire up Swagger in `main.ts`

Call `setupSwagger` in place of `SwaggerModule.setup`:

```typescript
// main.ts
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder } from "@nestjs/swagger";
import { setupSwagger } from "nest-swaggify";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder().setTitle("My API").setVersion("1.0").build();

  setupSwagger(app, config, { path: "api-docs" });

  await app.listen(3000);
}
bootstrap();
```

### 3. Pick the group via an environment variable

By default the `SWAGGER_GROUP` env var selects the served group:

```bash
# show only the public-api group doc
SWAGGER_GROUP=public-api npm start
```

You can put it in `.env` so different environments serve different group docs. Unset or `all` falls back to the full doc.

## 📖 API

### Decorators

| Decorator                        | Behavior                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `@SwaggerInclude(...groups)`     | Adds the endpoint to the specified groups; **also appears in the full doc** (Controller + Method merge)   |
| `@SwaggerIncludeOnly(...groups)` | Restricts the endpoint to the specified groups; **hidden from the full doc**; Method overrides Controller |
| `@SwaggerExclude()`              | **Hides the endpoint from every doc** — full and group-specific                                           |

Visibility at a glance:

| Decorator on the endpoint        | Full doc (`all`) | Specified groups | Other groups |
| -------------------------------- | :--------------: | :--------------: | :----------: |
| _(none)_                         |        ✅        |        ❌        |      ❌      |
| `@SwaggerInclude(...groups)`     |        ✅        |        ✅        |      ❌      |
| `@SwaggerIncludeOnly(...groups)` |        ❌        |        ✅        |      ❌      |
| `@SwaggerExclude()`              |        ❌        |        ❌        |      ❌      |

Decorators apply at the Controller or Method level. `@SwaggerInclude` and `@SwaggerIncludeOnly` accept multiple groups in one call:

```typescript
@SwaggerInclude("public-api", "partner-api")
@Controller("users")
```

**Priority:** `@SwaggerExclude` > `@SwaggerIncludeOnly` > `@SwaggerInclude`

**Controller + Method merging:** when both levels use the **same** decorator type, their groups are merged (deduplicated). When they use different types, the method-level decorator wins entirely.

### `setupSwagger(app, config, options?)`

Sets up a Swagger UI with group filtering. Call this in `main.ts` at startup.

**`options` parameters:**

- `path` — Swagger UI path (default: `'api'`)
- `groupEnvVar` — env var that selects the group (default: `'SWAGGER_GROUP'`)
- `verbose` — print logs (default: `true`)
- `onEmptyResult` — what to do when a group has no APIs: `'warn'` (default — log and fall back to the full doc), `'error'`, or `'silent'`

### `createSwaggerDocumentWithGroup(app, config, options?)`

Returns the filtered OpenAPI document without mounting any UI. Use this when you need to drive `SwaggerModule.setup` yourself:

```typescript
import { createSwaggerDocumentWithGroup } from "nest-swaggify";

const document = createSwaggerDocumentWithGroup(app, config, { group: "public-api" });
SwaggerModule.setup("api", app, document);
```

Options match `setupSwagger`, plus a `group` option that pins a specific group (overrides the env var). Omitting `group` or passing `"all"` returns the full document.

## 🛠️ CLI

`generate-swagger` emits Swagger/OpenAPI JSON after build — useful for static deployment, or as input for tools like OpenAPI Generator to produce SDKs / API Clients.

```bash
# generate the full doc + every detected group
generate-swagger --appModule=./dist/app.module

# generate only the full doc
generate-swagger --appModule=./dist/app.module --group=all

# generate one specific group
generate-swagger --appModule=./dist/app.module --group=public-api

# generate multiple groups
generate-swagger --appModule=./dist/app.module --group=public-api,internal-api
```

### Using a config file

Drop a `swaggify.config.ts` at the project root to skip repeated CLI flags:

```typescript
// swaggify.config.ts
import type { SwaggifyCliConfig } from "nest-swaggify";

const config: SwaggifyCliConfig = {
  appModule: "./dist/app.module",
  output: "./swagger-output",
  title: "My API",
  description: "API Documentation",
  version: "1.0",
  baseUrl: "http://localhost:3000",
};

export default config;
```

| Option        | Type                 | Description                                                                                                              |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `appModule`   | `string`             | Application module path (required)                                                                                       |
| `output`      | `string`             | Output directory                                                                                                         |
| `title`       | `string`             | API title                                                                                                                |
| `description` | `string`             | API description                                                                                                          |
| `version`     | `string`             | API version                                                                                                              |
| `baseUrl`     | `string \| string[]` | Base URL(s)                                                                                                              |
| `group`       | `string[] \| "all"`  | Which groups to generate. Omit for full doc + every group; `"all"` for full doc only; `["a","b"]` for the listed groups. |

**Precedence: CLI flags > config file > defaults**

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## 📄 License

[MIT](LICENSE)
