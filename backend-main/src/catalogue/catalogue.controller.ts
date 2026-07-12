import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { CreateCatalogueDto } from './dto/create-catalogue.dto';
import { UpdateCatalogueDto } from './dto/update-catalogue.dto';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Post()
  create(@Body() createCatalogue: CreateCatalogueDto) {
    return this.catalogueService.create(createCatalogue);
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
  update(@Param('id') id: string, @Body() dto: UpdateCatalogueDto) {
    return this.catalogueService.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.catalogueService.remove(+id);
  }
}
