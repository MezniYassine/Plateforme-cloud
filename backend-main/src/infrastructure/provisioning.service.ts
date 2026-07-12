import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Client } from "src/entities/client.entity";
import { MachineVirtuelle } from "src/entities/machineVirtuelle.entity";
import { ServiceStatus } from "src/enum/service-status.enum";
import { EsxiService } from "src/esxi/esxi.service";
import { Repository } from "typeorm";

// provisioning.service.ts
@Injectable()
export class ProvisioningService {
  constructor(
    @InjectRepository(MachineVirtuelle)
    private vmRepository: Repository<MachineVirtuelle>,
    private esxiService: EsxiService, // Ton service SOAP
  ) {}

  async createNewVm(client: Client, config: any) {
    // 1. Créer l'enregistrement en BDD (Statut: PROVISIONING)
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

    // Nom unique pour l'hyperviseur ESXi (évite les conflits entre utilisateurs)
    const esxiName = `${config.name}-${savedVm.id}`;

    // 2. Lancer le clonage sur l'ESXi en arrière-plan
    this.esxiService.cloneAndReconfigure(
      'Win2000-Template',
      esxiName,
      config.ram * 1024, // Conversion GB -> MB pour VMware
      config.cpu,
      config.storage
    ).then(async (taskId) => {
      // 3. Mise à jour une fois terminé
      savedVm.status = ServiceStatus.RUNNING;
      savedVm.vmReference = taskId; // On stocke la ref VMware
      await this.vmRepository.save(savedVm);
    }).catch(async (err) => {
      savedVm.status = ServiceStatus.FAILED;
      await this.vmRepository.save(savedVm);
    });

    return savedVm;
  }
}
