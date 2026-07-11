# nest-swaggify

NestJS Swagger extension — split one API spec into multiple group-scoped docs via decorators, with runtime switching and static JSON output.

## 📦 Installation

```bash
npm install nest-swaggify
# or
pnpm add nest-swaggify
```

## 🚀 Quick Start

Tag endpoints with the groups they belong to:

```typescript
import { SwaggerInclude } from "nest-swaggify";

@SwaggerInclude("public-api")
@Controller("users")
export class UsersController {
  @Get()
  findAll() {} // appears in the public-api group doc
}
```

Swap `SwaggerModule.setup` for `setupSwagger` in `main.ts`:

```typescript
import { setupSwagger } from "nest-swaggify";

setupSwagger(app, config, { path: "api-docs" });
```

Pick the served group via an environment variable:

```bash
SWAGGER_GROUP=public-api npm start
```

## 📖 Documentation

Full documentation, API reference, CLI usage, and examples are available on GitHub:

**👉 [github.com/noah4520/nest-swaggify](https://github.com/noah4520/nest-swaggify#readme)**

Bug reports and questions go to [issues](https://github.com/noah4520/nest-swaggify/issues).

## 📄 License

[MIT](https://github.com/noah4520/nest-swaggify/blob/main/LICENSE)
