import { Test, TestingModule } from '@nestjs/testing';
import { PaasController } from './paas.controller';

describe('PaasController', () => {
  let controller: PaasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaasController],
    }).compile();

    controller = module.get<PaasController>(PaasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
