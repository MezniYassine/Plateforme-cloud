import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason);
  console.warn('⚠️ [Process] Unhandled Promise Rejection capturé:', msg);
});

process.on('uncaughtException', (err: any) => {
  const msg = err?.message || String(err);
  console.error('⚠️ [Process] Uncaught Exception capturé:', msg);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
