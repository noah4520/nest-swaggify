#!/usr/bin/env node

import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder, OpenAPIObject } from "@nestjs/swagger";
import {
  collectAllGroups,
  filterDocumentByGroupWithMetadata,
  filterDocumentForAll,
  SwaggifyCliConfig,
} from "../index";
import * as fs from "fs";
import * as path from "path";

const DEFAULT_SERVER_URLS = ["http://localhost:3000"];
const CONFIG_FILE_NAMES = ["swaggify.config.ts", "swaggify.config.js"];

interface CliOptions {
  appModule?: string;
  output?: string;
  group?: string[] | "all";
  baseUrl?: string;
  title?: string;
  description?: string;
  version?: string;
}

function normalizeGroup(value: unknown): string[] | "all" | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === "all") return "all";
  if (Array.isArray(value)) {
    const cleaned = value.map((g) => String(g).trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (typeof value === "string") {
    const cleaned = value
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  return undefined;
}

function loadConfigFile(): SwaggifyCliConfig | null {
  const cwd = process.cwd();

  for (const configName of CONFIG_FILE_NAMES) {
    const configPath = path.join(cwd, configName);
    if (fs.existsSync(configPath)) {
      try {
        try {
          // Strip extension so Node can resolve either .ts (via ts-node) or a pre-compiled .js sibling.
          const modulePath = configPath.endsWith(".ts")
            ? configPath.replace(/\.ts$/, "")
            : configPath.replace(/\.js$/, "");

          delete require.cache[require.resolve(modulePath)];
          const configModule = require(modulePath);
          const config = configModule.default || configModule;

          if (config && typeof config === "object") {
            console.log(`[Swaggify] Loaded config file: ${configPath}`);
            return config as SwaggifyCliConfig;
          }
        } catch {
          // Plain require failed; fall back to ts-node for TypeScript configs.
          try {
            const tsNode = require("ts-node");
            tsNode.register({
              transpileOnly: true,
              compilerOptions: {
                module: "commonjs",
                esModuleInterop: true,
              },
            });

            delete require.cache[require.resolve(configPath)];
            const configModule = require(configPath);
            const config = configModule.default || configModule;

            if (config && typeof config === "object") {
              console.log(`[Swaggify] Loaded config file: ${configPath}`);
              return config as SwaggifyCliConfig;
            }
          } catch (tsNodeError) {
            console.warn(`[Swaggify] Unable to load TypeScript config file ${configPath}`);
            console.warn(`[Swaggify] Hint: compile the TypeScript file first or install ts-node`);
            console.warn(`[Swaggify] Error: ${tsNodeError}`);
          }
        }
      } catch (error) {
        console.warn(`[Swaggify] Unable to read config file ${configPath}:`, error);
      }
    }
  }

  return null;
}

function saveDocument(document: OpenAPIObject, outputDir: string, groupName: string): void {
  const base = groupName || "all";
  const timestamp = Date.now();
  const content = JSON.stringify(document, null, 2);

  const filepath = path.join(outputDir, `${base}-${timestamp}.json`);
  fs.writeFileSync(filepath, content);
  console.log(`  [Swaggify] Generated: ${filepath}`);

  const latestFilepath = path.join(outputDir, `${base}-latest.json`);
  fs.writeFileSync(latestFilepath, content);
  console.log(`  [Swaggify] Latest: ${latestFilepath}`);
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  function parseFlag(arg: string, flag: string): string | undefined {
    const prefix = `--${flag}=`;
    return arg.startsWith(prefix) ? arg.slice(prefix.length) : undefined;
  }

  args.forEach((arg) => {
    options.appModule ??= parseFlag(arg, "appModule");
    options.output ??= parseFlag(arg, "output");
    if (options.group === undefined) {
      options.group = normalizeGroup(parseFlag(arg, "group"));
    }
    options.baseUrl ??= parseFlag(arg, "baseUrl");
    options.title ??= parseFlag(arg, "title");
    options.description ??= parseFlag(arg, "description");
    options.version ??= parseFlag(arg, "version");
  });

  return options;
}

// CLI arguments override config-file values.
function mergeConfigs(configFile: SwaggifyCliConfig | null, cliArgs: CliOptions): CliOptions {
  const merged: CliOptions = {
    output: "./swagger-output",
  };

  if (configFile) {
    if (configFile.appModule) merged.appModule = configFile.appModule;
    if (configFile.output) merged.output = configFile.output;
    const normalizedGroup = normalizeGroup(configFile.group);
    if (normalizedGroup !== undefined) merged.group = normalizedGroup;
    if (configFile.baseUrl) {
      merged.baseUrl = Array.isArray(configFile.baseUrl)
        ? configFile.baseUrl.join(",")
        : configFile.baseUrl;
    }
    if (configFile.title) merged.title = configFile.title;
    if (configFile.description) merged.description = configFile.description;
    if (configFile.version) merged.version = configFile.version;
  }

  if (cliArgs.appModule) merged.appModule = cliArgs.appModule;
  if (cliArgs.output) merged.output = cliArgs.output;
  if (cliArgs.group) merged.group = cliArgs.group;
  if (cliArgs.baseUrl) merged.baseUrl = cliArgs.baseUrl;
  if (cliArgs.title) merged.title = cliArgs.title;
  if (cliArgs.description) merged.description = cliArgs.description;
  if (cliArgs.version) merged.version = cliArgs.version;

  return merged;
}

async function generateSwaggerJson(): Promise<void> {
  const configFile = loadConfigFile();
  const cliArgs = parseArgs();
  const options = mergeConfigs(configFile, cliArgs);

  if (!options.appModule) {
    console.error("[Error] Please specify the application module path: --appModule=<path>");
    console.error("Example: generate-swagger --appModule=./dist/app.module");
    process.exit(1);
  }

  let targetGroups: string[] = [];
  let mode: "default" | "all" | "specific" = "default";

  if (options.group) {
    if (options.group === "all") {
      mode = "all";
    } else {
      targetGroups = options.group;
      mode = "specific";
    }
  }

  const baseUrls = options.baseUrl
    ? options.baseUrl.split(",").map((url) => url.trim())
    : [...DEFAULT_SERVER_URLS];

  const appModulePath = path.isAbsolute(options.appModule)
    ? options.appModule
    : path.resolve(process.cwd(), options.appModule);

  const outputDir = path.isAbsolute(options.output!)
    ? options.output!
    : path.resolve(process.cwd(), options.output!);

  console.log("[Swaggify] Starting Swagger document generation...");
  console.log(`[Swaggify] Application module: ${appModulePath}`);
  console.log(`[Swaggify] Output directory: ${outputDir}`);
  console.log(`[Swaggify] Base URLs: ${baseUrls.join(", ")}`);

  let AppModule: any;
  try {
    if (appModulePath.endsWith(".ts")) {
      console.error("[Error] The CLI tool does not support loading TypeScript files directly");
      console.error("Please compile your application first, or use compiled JavaScript files");
      console.error("Example: generate-swagger --appModule=./dist/app.module");
      process.exit(1);
    } else {
      const modulePath = require.resolve(appModulePath);
      const module = require(modulePath);
      AppModule = module.default || module.AppModule || module;
    }
  } catch (error) {
    console.error(`[Error] Unable to load application module: ${appModulePath}`);
    console.error(error);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle(options.title || "API Documentation")
    .setDescription(options.description || "Auto-generated API documentation")
    .setVersion(options.version || "1.0");

  baseUrls.forEach((url) => {
    config.addServer(url);
  });

  const fullDocument = SwaggerModule.createDocument(app, config.build());

  console.log("\n[Swaggify] Scanning Swagger decorators...\n");
  const pathMetadataMap = collectAllGroups(app, fullDocument);

  const groupsSet = new Set<string>();
  pathMetadataMap.forEach((meta) => {
    if (meta.type === "include" || meta.type === "include-only") {
      meta.groups.forEach((g) => groupsSet.add(g));
    }
  });
  const allGroups = Array.from(groupsSet);

  fs.mkdirSync(outputDir, { recursive: true });

  const allDocument = filterDocumentForAll(fullDocument, pathMetadataMap);

  if (mode === "default") {
    console.log(
      `[Swaggify] Default mode: generating full docs + ${allGroups.length} group doc(s)\n`,
    );

    console.log("[Swaggify] Generating full API docs");
    saveDocument(allDocument, outputDir, "all");

    if (allGroups.length > 0) {
      console.log(`\n[Swaggify] Detected ${allGroups.length} group(s): ${allGroups.join(", ")}\n`);
      for (const group of allGroups) {
        console.log(`[Swaggify] Generating group: ${group}`);
        const filteredDoc = filterDocumentByGroupWithMetadata(fullDocument, pathMetadataMap, group);
        saveDocument(filteredDoc, outputDir, group);
      }
    }
  } else if (mode === "all") {
    console.log(`[Swaggify] Generating full API docs (no grouping)`);
    saveDocument(allDocument, outputDir, "all");
  } else {
    console.log(`[Swaggify] Generating specified groups only: ${targetGroups.join(", ")}\n`);
    for (const group of targetGroups) {
      console.log(`[Swaggify] Generating group: ${group}`);
      const filteredDoc = filterDocumentByGroupWithMetadata(fullDocument, pathMetadataMap, group);
      saveDocument(filteredDoc, outputDir, group);
    }
  }

  await app.close();
  console.log("\n[Swaggify] Done!");

  process.exit(0);
}

generateSwaggerJson().catch((error) => {
  console.error("[Swaggify] Error generating Swagger documents:", error);
  process.exit(1);
});
