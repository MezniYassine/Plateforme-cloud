import { Test, TestingModule } from '@nestjs/testing';
import { EsxiService } from './esxi.service';

describe('EsxiService', () => {
  let service: EsxiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EsxiService],
    }).compile();

    service = module.get<EsxiService>(EsxiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
