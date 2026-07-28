import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { Catalogue } from './entities/catalogue.entity';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Post()
  create(@Body() body: Partial<Catalogue>) {
    return this.catalogueService.create(body);
  }

  @Get()
  findAll() {
    return this.catalogueService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.catalogueService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<Catalogue>) {
    return this.catalogueService.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.catalogueService.remove(+id);
  }
}
