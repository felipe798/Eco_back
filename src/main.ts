import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';

const PORT = process.env.PORT || 4002;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Main');

  app.enableCors();

  const swaggerOptions = new DocumentBuilder()
    .setTitle('Desima API')
    .setDescription('API documentation for Desima')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const swaggerDoc = SwaggerModule.createDocument(app, swaggerOptions);
  SwaggerModule.setup(`/swagger`, app, swaggerDoc);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.use('/uploads', express.static('uploads'));

  // '0.0.0.0' es obligatorio para Fly.io
  await app.listen(PORT, '0.0.0.0');

  logger.log(`Listening to http://0.0.0.0:${PORT}`);
  logger.log(`Swagger UI: http://0.0.0.0:${PORT}/swagger`);
}
bootstrap();