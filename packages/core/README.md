# nest-swaggify

NestJS Swagger grouped documentation generator - supports splitting API docs into groups based on decorators.

## 📦 Installation

```bash
npm install nest-swaggify
# or
pnpm add nest-swaggify
```

## 🚀 Quick Start

```typescript
import { SwaggerInclude, SwaggerIncludeOnly, SwaggerExclude } from "nest-swaggify";

@SwaggerInclude("public-api")
@Controller("users")
export class UsersController {
  @Get()
  findAll() {} // ✅ Appears in public-api and all
}
```

```typescript
import { setupSwagger } from "nest-swaggify";

setupSwagger(app, config, {
  path: "api-docs",
  groupEnvVar: "SWAGGER_GROUP",
});
```

## 📖 Documentation

Full documentation, API reference, CLI usage, and examples are available on GitHub:

**👉 [github.com/noah4520/nest-swaggify](https://github.com/noah4520/nest-swaggify#readme)**

## 📄 License

[MIT](https://github.com/noah4520/nest-swaggify/blob/main/LICENSE)
