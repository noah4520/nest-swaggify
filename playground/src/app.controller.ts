import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { SwaggerInclude, SwaggerIncludeOnly, SwaggerExclude } from "nest-swaggify";

@ApiTags("app")
@SwaggerInclude("public-api")
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: "Health check" })
  getHello(): { message: string } {
    return { message: "Hello from Playground!" };
  }

  @Get("public")
  @SwaggerInclude("public-api")
  @ApiOperation({ summary: "Public endpoint" })
  getPublic(): { message: string } {
    return { message: "This is a public endpoint" };
  }

  @Get("internal")
  @SwaggerIncludeOnly("internal-api")
  @ApiOperation({ summary: "Internal endpoint" })
  getInternal(): { message: string } {
    return { message: "This is an internal endpoint" };
  }

  @Get("excluded")
  @SwaggerExclude()
  @ApiOperation({ summary: "Excluded endpoint" })
  getExcluded(): { message: string } {
    return { message: "This endpoint should not appear in docs" };
  }
}
