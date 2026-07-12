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

[English](README.md) | **繁體中文**

NestJS Swagger 擴充套件 — 用 decorator 將同一份 API 文件依群組輸出，支援 runtime 切換與產生靜態 JSON。

## 💡 為什麼需要 Nest Swaggify

當一個 NestJS 服務需要對外提供「不只一份」Swagger 文件時，原生 `@nestjs/swagger` 沒辦法直接做到。常見情境：

- **公開 API vs 內部工具** — 同一個服務同時對外部開發者與內部 admin 提供 API，但兩邊看到的 endpoint 應該不一樣。
- **不同合作夥伴串接** — 給 partner A 的文件不該包含 partner B 專屬的 endpoint，反之亦然。
- **多版本 API 並存** — v1 / v2 / v3 endpoint 都還在同一個服務裡，希望各自有獨立的 Swagger UI。
- **產出多份 OpenAPI JSON** — 同一份程式碼輸出多份 OpenAPI 規格，提供給相關工具使用。

Nest Swaggify 用 decorator 標記每支 endpoint 屬於哪些群組；啟動時用環境變數切換要顯示哪一份，或透過 CLI 一次產出每個群組的 Swagger JSON。

## ✨ 特色

- 🪶 **無痛整合** — 沿用 `@nestjs/swagger` 的 `DocumentBuilder`，只要把 `SwaggerModule.setup` 換成 `setupSwagger`；原生的 `@ApiTags`、`@ApiOperation` 等 decorator 全部照常運作，不需要重新學習新的 API。
- 🎯 **與 Nest 相同的 decorator 機制** — 底層沿用 Nest 原生的 `SetMetadata`，行為和 `@UseGuards`、`@ApiTags` 一致；用 `@SwaggerInclude`、`@SwaggerIncludeOnly`、`@SwaggerExclude` 在 Controller 或 Method 層級控制每支 API 該出現在哪些群組。
- 🔀 **Runtime 切換 + 靜態輸出** — 用環境變數決定 Swagger UI 要顯示完整文件或特定群組文件；也可以透過 `generate-swagger` CLI 輸出指定群組的 Swagger JSON。

## 📦 安裝

```bash
npm install nest-swaggify
```

## 🚀 快速開始

### 1. 使用 decorator 標記 API

在 Controller 或 Method 上加 decorator，標記要納入哪個群組：

```typescript
import { Controller, Get } from "@nestjs/common";
import { SwaggerInclude } from "nest-swaggify";

@SwaggerInclude("public-api")
@Controller("users")
export class UsersController {
  @Get()
  findAll() {} // 出現在 public-api 群組文件
}
```

其他 decorator 與用法請見 [API 章節](#-api)。

### 2. 在 `main.ts` 設定 Swagger

在應用啟動時呼叫 `setupSwagger`，取代原本的 `SwaggerModule.setup`：

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

### 3. 用環境變數指定群組

預設使用環境變數 `SWAGGER_GROUP` 可以指定顯示的群組文件：

```bash
# 顯示 public-api 群組文件
SWAGGER_GROUP=public-api npm start
```

也可以寫進 `.env` 使其根據不同環境來顯示不同群組文件，不設定或設為 `all` 時顯示完整文件。

## 📖 API

### Decorators

| Decorator                        | 行為                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `@SwaggerInclude(...groups)`     | 將 endpoint 加入指定群組,**完整文件也會出現**(Controller + Method 群組合併)      |
| `@SwaggerIncludeOnly(...groups)` | 將 endpoint **只**保留在指定群組,**不出現在完整文件**;Method 層級覆寫 Controller |
| `@SwaggerExclude()`              | 將 endpoint **從所有文件中隱藏**(包含完整文件)                                   |

可見性一覽：

| Endpoint 上的 decorator          | 完整文件（`all`） | 指定的群組 | 其他群組 |
| -------------------------------- | :---------------: | :--------: | :------: |
| _（未標記）_                     |        ✅         |     ❌     |    ❌    |
| `@SwaggerInclude(...groups)`     |        ✅         |     ✅     |    ❌    |
| `@SwaggerIncludeOnly(...groups)` |        ❌         |     ✅     |    ❌    |
| `@SwaggerExclude()`              |        ❌         |     ❌     |    ❌    |

Decorator 能掛在 Controller 或 Method 上。`@SwaggerInclude` 與 `@SwaggerIncludeOnly` 支援一次傳多個群組：

```typescript
@SwaggerInclude("public-api", "partner-api")
@Controller("users")
```

**優先順序：** `@SwaggerExclude` > `@SwaggerIncludeOnly` > `@SwaggerInclude`

**Controller 與 Method 合併規則：** 兩層使用**同一種** decorator 時，群組合併（去重）；兩層使用不同種類時，Method 層級完全勝出。

### `setupSwagger(app, config, options?)`

設定具群組篩選功能的 Swagger UI（於 `main.ts` 啟動時呼叫）。

**options 參數：**

- `path` — Swagger UI 路徑（預設 `'api'`）
- `groupEnvVar` — 切換群組的環境變數名稱（預設 `'SWAGGER_GROUP'`）
- `verbose` — 是否輸出 log（預設 `true`）
- `onEmptyResult` — 特定群組找不到任何 API 時的行為：`'warn'`（預設，警告並回退完整文件）、`'error'`、`'silent'`

### `createSwaggerDocumentWithGroup(app, config, options?)`

只回傳篩選後的 OpenAPI 物件，不自動掛載 UI。當你需要自己控制 `SwaggerModule.setup` 時用：

```typescript
import { createSwaggerDocumentWithGroup } from "nest-swaggify";

const document = createSwaggerDocumentWithGroup(app, config, { group: "public-api" });
SwaggerModule.setup("api", app, document);
```

選項與 `setupSwagger` 相同，另外多一個 `group` 可手動指定群組（優先順序高於環境變數）。`group` 不指定或設為 `all` 時會回傳完整文件。

## 🛠️ CLI 工具

`generate-swagger` 可在 build 後產出 Swagger/OpenAPI JSON，適合靜態部署，或作為 OpenAPI Generator 等工具產生 SDK / API Client 的輸入。

```bash
# 產生所有的群組文件
generate-swagger --appModule=./dist/app.module

# 只產生 'all' 群組
generate-swagger --appModule=./dist/app.module --group=all

# 產生指定的群組 'public-api'
generate-swagger --appModule=./dist/app.module --group=public-api

# 產生多個群組
generate-swagger --appModule=./dist/app.module --group=public-api,internal-api
```

### 使用 CLI 設定檔

在專案根目錄建立 `swaggify.config.ts`，可省略常用 CLI 參數：

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

| 參數          | 型別                 | 說明                                                                                                 |
| ------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `appModule`   | `string`             | 應用模組路徑（必填）                                                                                 |
| `output`      | `string`             | 輸出目錄                                                                                             |
| `title`       | `string`             | API 標題                                                                                             |
| `description` | `string`             | API 說明                                                                                             |
| `version`     | `string`             | API 版本                                                                                             |
| `baseUrl`     | `string \| string[]` | 基礎 URL                                                                                             |
| `group`       | `string[] \| "all"`  | 指定輸出群組；省略時產生完整文件與所有群組，`"all"` 則只產生完整文件，`["a","b"]` 則只產生指定的群組 |

**優先順序：CLI 參數 > 設定檔 > 預設值**

## 🤝 貢獻

歡迎貢獻！請參考 [CONTRIBUTING.md](CONTRIBUTING.md) 了解開發環境設定與規範。

## 📄 授權

[MIT](LICENSE)
