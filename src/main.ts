import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

function resolveCorsOrigin(raw: string | undefined): true | string[] {
  if (!raw || raw.trim() === '*') return true;
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  app.enableCors({ origin: resolveCorsOrigin(configService.get('CORS_ORIGIN')) });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}
void bootstrap();
