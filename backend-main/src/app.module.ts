import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailtrapTransport } from 'mailtrap';
import { AdminModule } from './admin/admin.module';
import { PersonnelModule } from './personnel/personnel.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'password',
      database: process.env.DB_NAME ?? 'dynamix_db',
      autoLoadEntities: true,
      synchronize: true, // disable in production
      logging: false,
    }),
    AuthModule,
    UsersModule,
    InfrastructureModule,
    AdminModule,
    PersonnelModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        transport: /*MailtrapTransport*/({
          //token: config.get<string>('MAILTRAP_TOKEN') || '',
          host: 'sandbox.smtp.mailtrap.io',
          port: 2525,
          auth: {
            user: config.get<string>('MAILTRAP_SANDBOX_USER'),
            pass: config.get<string>('MAILTRAP_SANDBOX_PASS'),
          },
        }),
        defaults: {
          from: '"Equipe Dynamix" <hello@demomailtrap.co>',
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
