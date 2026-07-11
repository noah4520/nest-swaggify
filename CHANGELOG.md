# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `@SwaggerInclude(...groups)` decorator — include endpoint in specified group(s) and full docs
- `@SwaggerIncludeOnly(...groups)` decorator — include endpoint only in specified group(s)
- `@SwaggerExclude()` decorator — exclude endpoint from all docs
- `setupSwagger()` utility for runtime group-based Swagger setup
- `createSwaggerDocumentWithGroup()` for manual document generation
- CLI tool `generate-swagger` for static Swagger JSON generation
- Config file support (`swaggify.config.ts` / `swaggify.config.js`)
- Environment variable filtering via `SWAGGER_GROUP`
- NestJS 11 compatibility
- Contribution guidelines and release/changelog policy
