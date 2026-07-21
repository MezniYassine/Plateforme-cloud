import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Client } from "src/entities/client.entity";
import { MachineVirtuelle } from "src/entities/machineVirtuelle.entity";
import { ServiceStatus } from "src/enum/service-status.enum";
import { EsxiService } from "src/esxi/esxi.service";
import { Repository } from "typeorm";

@Injectable()
export class ProvisioningService {
  constructor(
    @InjectRepository(MachineVirtuelle)
    private vmRepository: Repository<MachineVirtuelle>,
    private esxiService: EsxiService,
  ) { }

  async createNewVm(client: Client, config: any) {
    const newVm = this.vmRepository.create({
      nomPersonnalise: config.name,
      vCPU: config.cpu,
      ramGB: config.ram,
      stockageGB: config.storage,
      status: ServiceStatus.PROVISIONING,
      client: client,
      os: 'Windows 2000'
    });

    const savedVm = await this.vmRepository.save(newVm);

    const esxiName = `${config.name}-${savedVm.id}`;

    this.esxiService.cloneAndReconfigure(
      'Win2000-Template',
      esxiName,
      config.ram * 1024,
      config.cpu,
      config.storage
    ).then(async (taskId) => {
      savedVm.status = ServiceStatus.RUNNING;
      savedVm.vmReference = taskId;
      await this.vmRepository.save(savedVm);
    }).catch(async (err) => {
      savedVm.status = ServiceStatus.FAILED;
      await this.vmRepository.save(savedVm);
    });

    return savedVm;
  }
}
