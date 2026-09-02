import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { AdminModule } from './admin/admin.module';
import { PersonnelModule } from './personnel/personnel.module';
import { EntrepriseAdminModule } from './entreprise-admin/entreprise-admin.module';
import { EntrepriseUserModule } from './entreprise-user/entreprise-user.module';
import { EsxiModule } from './esxi/esxi.module';
import { Admin } from './entities/admin.entity';
import { Client } from './entities/client.entity';
import { Entreprise } from './entities/entreprise.entity';
import { MachineVirtuelle } from './entities/machineVirtuelle.entity';
import { Personal } from './entities/personal.entity';
import { ServiceInstance } from './entities/serviceInstance.entity';
import { CatalogueModule } from './catalogue/catalogue.module';
import { Catalogue } from './catalogue/entities/catalogue.entity';
import { DemandeModule } from './demande/demande.module';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import { WalletModule } from './wallet/wallet.module';
import { MailModule } from './mail/mail.module';
import { PaasModule } from './paas/paas.module';
import { ServicePaaS } from './entities/servicePaaS.entity';
import { SaasModule } from './saas/saas.module';
import { ScheduleModule } from '@nestjs/schedule';
import { Metric } from './entities/metric.entity';
import { MetricsModule } from './metrics/metrics.module';
import { SystemLog } from './entities/system-log.entity';
import { LogsModule } from './logs/logs.module';
import { SupportTicket } from './entities/support-ticket.entity';
import { TicketsModule } from './tickets/tickets.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'password',
      database: process.env.DB_NAME ?? 'dynamix_db',
      entities: [Admin, Client, Entreprise, MachineVirtuelle, Personal, ServiceInstance, Catalogue, Wallet, Transaction, ServicePaaS, Metric, SystemLog, SupportTicket],
      autoLoadEntities: true,
      synchronize: true, // disable in production
      logging: false,
    }),
    AuthModule,
    UsersModule,
    AdminModule,
    EntrepriseAdminModule,
    EntrepriseUserModule,
    PersonnelModule,
    EsxiModule,
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
    CatalogueModule,
    DemandeModule,
    WalletModule,
    MailModule,
    PaasModule,
    SaasModule,
    MetricsModule,
    LogsModule,
    TicketsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
