import { SetMetadata } from "@nestjs/common";

export const SWAGGER_INCLUDE = "swagger:include";
export const SWAGGER_INCLUDE_ONLY = "swagger:include-only";
export const SWAGGER_EXCLUDE = "swagger:exclude";

/**
 * Adds the endpoint to the specified group(s); also appears in the full doc.
 * Controller and Method-level groups merge.
 * @param groups - Group name(s)
 *
 * @example
 * ```typescript
 * @SwaggerInclude('public-api')
 * @Controller('users')
 * export class UsersController {
 *   @Get()
 *   findAll() {}  // appears in public-api and the full doc
 * }
 * ```
 */
export const SwaggerInclude = (...groups: string[]) => SetMetadata(SWAGGER_INCLUDE, groups);

/**
 * Restricts the endpoint to the specified group(s); does not appear in the
 * full doc, and at the Method level overrides any Controller-level
 * `@SwaggerInclude` (Controller groups are not inherited).
 * @param groups - Group name(s)
 *
 * @example
 * ```typescript
 * @Controller('products')
 * export class ProductsController {
 *   @SwaggerIncludeOnly('internal-api')
 *   @Post('admin')
 *   adminCreate() {}  // appears only in internal-api
 * }
 * ```
 */
export const SwaggerIncludeOnly = (...groups: string[]) =>
  SetMetadata(SWAGGER_INCLUDE_ONLY, groups);

/**
 * Hides the endpoint from every doc — full and group-specific.
 *
 * @example
 * ```typescript
 * @Controller('products')
 * export class ProductsController {
 *   @SwaggerExclude()
 *   @Delete('purge')
 *   purgeAll() {}  // hidden everywhere
 * }
 * ```
 */
export const SwaggerExclude = () => SetMetadata(SWAGGER_EXCLUDE, true);
