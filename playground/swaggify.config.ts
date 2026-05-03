import type { SwaggifyCliConfig } from "nest-swaggify";

const config: SwaggifyCliConfig = {
  appModule: "./dist/app.module",
  output: "./swagger-output",
  title: "Playground API",
  description: "Testing nest-swaggify API",
  version: "1.0",
  baseUrl: "http://localhost:3000",
};

export default config;
