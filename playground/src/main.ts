import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { createSwaggerDocumentWithGroup, setupSwagger } from "nest-swaggify";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle("Playground API")
    .setDescription("Testing nest-swaggify")
    .setVersion("1.0")
    .build();

  setupSwagger(app, config, {
    path: "api",
    // .env.example sets SWAGGER_GROUP to "all" by default.
    // Change it to "public-api" or "internal-api" to test group filtering.
    groupEnvVar: "SWAGGER_GROUP",
  });

  const publicDoc = createSwaggerDocumentWithGroup(app, config, {
    group: "public-api",
    verbose: false,
  });
  SwaggerModule.setup("api/public", app, publicDoc);

  const internalDoc = createSwaggerDocumentWithGroup(app, config, {
    group: "internal-api",
    verbose: false,
  });
  SwaggerModule.setup("api/internal", app, internalDoc);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger UI (all):     http://localhost:${port}/api`);
  console.log(`Swagger UI (public):     http://localhost:${port}/api/public`);
  console.log(`Swagger UI (internal):   http://localhost:${port}/api/internal`);
}

bootstrap();
