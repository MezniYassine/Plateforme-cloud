import { Module } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { CatalogueController } from './catalogue.controller';
import { Catalogue } from './entities/catalogue.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Catalogue])],
  controllers: [CatalogueController],
  providers: [CatalogueService],
})
export class CatalogueModule {}
