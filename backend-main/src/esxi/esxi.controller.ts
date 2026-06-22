import { Controller, Patch, Param, Body, ParseIntPipe, Get, UseGuards, Req, HttpException, HttpStatus, Post, ForbiddenException, NotFoundException, Delete } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { EsxiService } from './esxi.service';
import { ServiceStatus } from 'src/enum/service-status.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { Client } from 'src/entities/client.entity';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { Repository } from 'typeorm';

import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateVmDto {
  @IsString()
  name!: string;     
  
  @IsNumber()
  ramGB!: number;    
  
  @IsNumber()
  vCPU!: number;    
  
  @IsOptional()
  @IsNumber()
  storageGB?: number;
  
  @IsOptional()
  @IsString()
  templateName: string = 'windows 2000'; 
  
  @IsOptional()
  @IsNumber()
  catalogueId?: number;
}

@Controller('esxi')
export class EsxiController {
    constructor(private readonly esxiService: EsxiService,
        @InjectRepository(MachineVirtuelle)
    private readonly vmRepo: Repository<MachineVirtuelle>,
        @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
        @InjectRepository(Catalogue)
    private readonly catalogueRepo: Repository<Catalogue>
    ) { }

    @Get('test-connection')
    async testConnection() {
        try {
            const sessionId = await this.esxiService.getSession();
            return {
                status: 'Success',
                message: 'Connecté à l\'ESXi avec succès !',
                token: sessionId,
            };
        } catch (error) {
            return {
                status: 'Error',
                message: 'Impossible de se connecter à l\'ESXi',
                details: error.message,
            };
        }
    }
    @Get('vms')
    async getAllVms() {
        try {
            const vms = await this.esxiService.getVms();
            return {
                status: 'Success',
                count: vms.length,
                data: vms,
            };
        } catch (error) {
            throw new HttpException({
                status: 'Error',
                message: 'Impossible de récupérer la liste des VMs',
                details: error.message,
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    // Dans esxi.controller.ts
    @Post('power/:id')
    async togglePower(@Param('id') id: string, @Body('action') action: 'start' | 'stop') {
    try {
        await this.esxiService.powerControl(id, action);
        return { status: 'Success', message: `VM ${action}ed successfully` };
    } catch (error) {
        return { status: 'Error', message: error.message };
    }
    }

    @Get('host-stats')
    async getHostStats() {
        try {
            const stats = await this.esxiService.getHostStats();
            return { status: 'Success', data: stats };
        } catch (error) {
            return { status: 'Error', message: error.message };
        }
    }

  @UseGuards(JwtAuthGuard)
  @Get('my-vms')
  async getMyVms(@Req() req: any) {
    const vms = await this.vmRepo.find({
      where: { client: { id: req.user.sub } },
      relations: ['catalogue'],
      order: { dateCreation: 'DESC' },
    });

    return Promise.all(vms.map((vm) => this.syncVmRuntimeStatus(vm)));
  }

  @UseGuards(JwtAuthGuard)
  @Post('my-vms/:id/power')
  async powerMyVm(
    @Param('id', ParseIntPipe) id: number,
    @Body('action') action: 'start' | 'stop',
    @Req() req: any,
  ) {
    if (!action || !['start', 'stop'].includes(action)) {
      throw new HttpException(
        { status: 'Error', message: 'Action invalide. Utilisez "start" ou "stop".' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const vm = await this.vmRepo.findOne({
      where: { id, client: { id: req.user.sub } },
      relations: ['client'],
    });

    if (!vm) {
      throw new NotFoundException('VM introuvable pour ce client.');
    }

    // Résolution de la référence ESXi (vmReference = ID VMware ou nom personnalisé)
    const esxiRef = vm.vmReference || vm.nomPersonnalise;

    try {
      await this.esxiService.powerControl(esxiRef, action);
    } catch (error) {
      throw new HttpException(
        { status: 'Error', message: `Commande ESXi échouée: ${error.message}` },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Mise à jour du statut en base de données
    const syncedVm = await this.syncVmRuntimeStatus(vm);
    const newStatus = syncedVm.status;

    return {
      status: 'Success',
      message: `VM ${vm.nomPersonnalise} ${action === 'start' ? 'démarrée' : 'arrêtée'} avec succès.`,
      vmId: id,
      newStatus,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('my-vms/:id')
  async deleteMyVm(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const vm = await this.vmRepo.findOne({
      where: { id, client: { id: req.user.sub } },
      relations: ['client'],
    });

    if (!vm) {
      throw new NotFoundException('VM introuvable pour ce client.');
    }

    if (vm.nomPersonnalise.toLowerCase().startsWith('template')) {
      throw new ForbiddenException('Impossible de supprimer un template depuis cet espace.');
    }

    await this.esxiService.deleteVm(vm.vmReference || vm.nomPersonnalise, vm.nomPersonnalise);
    await this.vmRepo.remove(vm);

    return {
      status: 'Success',
      message: `VM ${vm.nomPersonnalise} supprimée.`,
      vmId: id,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('provision')
  async provisionNewVm(@Body() dto: CreateVmDto, @Req() req: any) {
    console.log('DTO Received in provisionNewVm:', dto);

    if (req.user.role === 'GLOBAL_ADMIN') {
      throw new ForbiddenException("Un administrateur global ne peut pas provisionner une VM client.");
    }

    const clientId = Number(req.user.sub);
    const client = await this.clientRepo.findOne({ where: { id: clientId } });

    if (!client) {
      throw new NotFoundException(`Client introuvable pour l'id ${clientId}. Reconnecte-toi avec un compte client valide.`);
    }

    const catalogue = dto.catalogueId
      ? await this.catalogueRepo.findOne({ where: { id: Number(dto.catalogueId), isActive: true } })
      : null;

    if (dto.catalogueId && !catalogue) {
      throw new NotFoundException(`Offre catalogue #${dto.catalogueId} introuvable ou inactive.`);
    }

    // 1. CRÉATION EN BASE DE DONNÉES (Statut: PROVISIONING)
    // Use direct instantiation instead of vmRepo.create() to fix TypeORM
    // ChildEntity bug where parent columns (nomPersonnalise) are ignored.
    const newVmRecord = new MachineVirtuelle();
    newVmRecord.nomPersonnalise = dto.name;
    newVmRecord.vCPU = dto.vCPU;
    newVmRecord.ramGB = dto.ramGB;
    newVmRecord.stockageGB = dto.storageGB ?? 20;
    newVmRecord.status = ServiceStatus.PROVISIONING;
    newVmRecord.dateCreation = new Date();
    newVmRecord.os = this.getOsNameFromTemplate(dto.templateName);
    newVmRecord.client = client;
    newVmRecord.catalogue = catalogue;

    const savedVm = await this.vmRepo.save(newVmRecord);

    // 2. LANCER LE CLONAGE SUR ESXI (Asynchrone)
    this.esxiService.cloneAndReconfigure(
      dto.templateName,
      dto.name,
      dto.ramGB * 1024,
      dto.vCPU,
      dto.storageGB ?? 20
    )
    .then(async (taskId) => {
      await this.vmRepo.update(savedVm.id, {
        status: ServiceStatus.RUNNING,
        vmReference: taskId,
      });
      console.log(`✅ VM ${dto.name} prête et enregistrée !`);
    })
    .catch(async (err) => {
      await this.vmRepo.update(savedVm.id, { status: ServiceStatus.FAILED });
      console.error(`❌ Échec provisioning: ${err.message}`);
    });

    // 3. RÉPONSE IMMÉDIATE AU FRONTEND
    return {
      message: "Le déploiement de votre machine a commencé.",
      vmId: savedVm.id,
      status: savedVm.status,
      vm: savedVm,
    };
  }

  private async syncVmRuntimeStatus(vm: MachineVirtuelle): Promise<MachineVirtuelle> {
    const runtime = await this.esxiService.getVmRuntime(
      vm.vmReference || vm.nomPersonnalise,
      vm.nomPersonnalise,
    );

    if (!runtime) {
      return vm;
    }

    const runtimeStatus = this.mapPowerStateToStatus(runtime.state);
    const updates: Partial<MachineVirtuelle> = {};

    if (runtimeStatus && vm.status !== runtimeStatus) {
      updates.status = runtimeStatus;
      vm.status = runtimeStatus;
    }

    if (!vm.vmReference && runtime.id) {
      updates.vmReference = runtime.id;
      vm.vmReference = runtime.id;
    }

    if (Object.keys(updates).length > 0) {
      await this.vmRepo.update(vm.id, updates);
    }

    return vm;
  }

  private mapPowerStateToStatus(powerState: string): ServiceStatus | null {
    switch (powerState) {
      case 'poweredOn':
        return ServiceStatus.RUNNING;
      case 'poweredOff':
      case 'suspended':
        return ServiceStatus.STOPPED;
      default:
        return null;
    }
  }

  private getOsNameFromTemplate(templateName?: string): string {
    return templateName?.replace(/^template\s*/i, '').trim() || 'Windows 2000';
  }

}
