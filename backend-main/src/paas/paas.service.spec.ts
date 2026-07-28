import { Test, TestingModule } from '@nestjs/testing';
import { PaasService } from './paas.service';

describe('PaasService', () => {
  let service: PaasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaasService],
    }).compile();

    service = module.get<PaasService>(PaasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
