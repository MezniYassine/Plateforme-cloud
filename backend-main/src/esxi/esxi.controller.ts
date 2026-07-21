import { Controller, Patch, Param, Body, ParseIntPipe, Get, UseGuards, Req, HttpException, HttpStatus, Post, ForbiddenException, NotFoundException, Delete, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { EsxiService } from './esxi.service';
import { ServiceStatus } from 'src/enum/service-status.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { Client } from 'src/entities/client.entity';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';
import { Repository } from 'typeorm';
import { WalletService } from 'src/wallet/wallet.service';
import { MailService } from 'src/mail/mail.service';

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
    private readonly catalogueRepo: Repository<Catalogue>,
    private readonly walletService: WalletService,
    private readonly mailService: MailService,
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

  // 🔍 Endpoint de debug temporaire — retourne les données SOAP brutes d'une VM spécifique
  @Get('vms-raw-debug/:vmId')
  async getRawVmDebug(@Param('vmId') vmId: string) {
    return this.esxiService.getRawGuestInfo(vmId);
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

    // Supprimer et exclure les instances en échec (FAILED) pour ne pas polluer l'interface
    const activeVms = vms.filter(vm => vm.status !== ServiceStatus.FAILED);
    const failedVms = vms.filter(vm => vm.status === ServiceStatus.FAILED);
    for (const f of failedVms) {
      try {
        await this.vmRepo.delete(f.id);
      } catch (err) {
        console.error(`Impossible de nettoyer la VM en échec #${f.id} :`, err.message);
      }
    }

    return Promise.all(activeVms.map((vm) => this.syncVmRuntimeStatus(vm)));
  }

  // --- AJOUTE CETTE ROUTE POUR RÉCUPÉRER UNE SEULE VM ---
  @UseGuards(JwtAuthGuard)
  @Get('my-vms/:id')
  async getMyVmById(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const vm = await this.vmRepo.findOne({
      where: { id, client: { id: req.user.sub } },
      relations: ['catalogue'],
    });

    if (!vm) {
      throw new NotFoundException(`Machine virtuelle avec l'ID ${id} introuvable pour ce client.`);
    }

    if (vm.status === ServiceStatus.FAILED) {
      try {
        await this.vmRepo.delete(vm.id);
      } catch (err) {}
      throw new NotFoundException(`Machine virtuelle avec l'ID ${id} introuvable (provisionnement échoué).`);
    }

    // On synchronise le statut en temps réel avec l'ESXi avant de renvoyer la VM
    return this.syncVmRuntimeStatus(vm);
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

    if (vm.status === ServiceStatus.AWAITING_PAYMENT && action === 'start') {
      throw new ForbiddenException('Solde insuffisant. Veuillez recharger votre portefeuille pour allumer cette machine.');
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

    // Tentative de suppression sur ESXi (peut échouer si la VM est orpheline,
    // c'est-à-dire que le provisionnement avait échoué et la VM n'existe pas sur l'hyperviseur)
    if (vm.vmReference || vm.status !== ServiceStatus.FAILED) {
      try {
        await this.esxiService.deleteVm(vm.vmReference || vm.nomPersonnalise, vm.nomPersonnalise);
      } catch (esxiError) {
        // Si la VM n'existe pas sur l'ESXi, on supprime quand même l'entrée en base
        console.warn(`[EsxiController] VM #${id} absente de l'ESXi (orpheline), suppression DB uniquement : ${esxiError.message}`);
      }
    }

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

    // --- VÉRIFICATION DU SOLDE WALLET ---
    // Seuls les PERSONNEL et ENTREPRISE_ADMIN ont un wallet
    // Les ENTREPRISE_USER passent par le flux demande (approuvé par l'admin)
    const prixMensuel = catalogue ? Number(catalogue.prix) : 0;
    if (prixMensuel > 0) {
      const soldeOk = await this.walletService.checkSolde(clientId, prixMensuel);
      if (!soldeOk) {
        const wallet = await this.walletService.getOrCreateWallet(clientId);
        throw new BadRequestException(
          `Solde insuffisant. Votre solde actuel est de ${Number(wallet.solde).toFixed(3)} DT. Cette VM coûte ${prixMensuel.toFixed(3)} DT/mois.`
        );
      }
    }

    // 1. VÉRIFICATION DU NOM (Éviter les conflits pour ce client spécifique)
    const existingDbVm = await this.vmRepo.findOne({ 
      where: { nomPersonnalise: dto.name, client: { id: clientId } } 
    });
    if (existingDbVm) {
      throw new BadRequestException(`Vous avez déjà une machine nommée "${dto.name}". Veuillez choisir un autre nom.`);
    }

    // 2. CRÉATION EN BASE DE DONNÉES (Statut: PROVISIONING)
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
    newVmRecord.prixMensuel = prixMensuel;

    const savedVm = await this.vmRepo.save(newVmRecord);

    // Nom unique garanti pour l'ESXi (évite les conflits entre utilisateurs)
    const esxiName = `${dto.name}-${savedVm.id}`;

    // 3. LANCER LE CLONAGE SUR ESXI (Asynchrone)
    this.esxiService.cloneAndReconfigure(
      dto.templateName,
      esxiName,
      dto.ramGB * 1024,
      dto.vCPU,
      dto.storageGB ?? 20
    )
      .then(async (taskId) => {
        const now = new Date();
        const nextMonth = new Date(now);
        nextMonth.setMonth(now.getMonth() + 1);

        await this.vmRepo.update(savedVm.id, {
          status: ServiceStatus.RUNNING,
          vmReference: taskId,
          dateProchaineFacturation: nextMonth,
        });
        console.log(`✅ VM ${dto.name} prête et enregistrée ! Prochaine facturation: ${nextMonth.toISOString()}`);

        // --- DÉBIT DU WALLET : on débite une fois la VM réellement prête ---
        if (prixMensuel > 0) {
          try {
            await this.walletService.debiter(
              clientId,
              prixMensuel,
              `Provisionnement VM: ${dto.name} (${catalogue?.nomService ?? 'Offre catalogue'}) — ${prixMensuel} DT/mois`,
              savedVm.id,
            );
            console.log(`💸 Débit de ${prixMensuel} DT pour VM "${dto.name}" (client #${clientId})`);
          } catch (walletErr) {
            console.error(`⚠️ Impossible de débiter le wallet pour VM #${savedVm.id}:`, walletErr.message);
          }
        }

        // ── EMAIL : Notifier le personnel que sa VM est prête ─────────────────
        const specs = catalogue
          ? `${catalogue.vcpu} vCPU · ${catalogue.ramMB} GB RAM · ${catalogue.stockageGB} GB SSD`
          : `${dto.vCPU} vCPU · ${dto.ramGB} GB RAM · ${dto.storageGB ?? 20} GB SSD`;
        this.mailService.sendProvisionningSuccesPersonnel({
          userEmail: client.email,
          userPrenom: client.prenom,
          userNom: client.nom,
          nomInstance: dto.name,
          specs,
          esxiRef: taskId ?? esxiName,
        });
      })
      .catch(async (err) => {
        // Supprimer immédiatement la VM orpheline en cas d'échec de provisionnement
        try {
          await this.vmRepo.delete(savedVm.id);
        } catch (dbErr) {
          console.error(`[EsxiController] Impossible de supprimer la VM orpheline #${savedVm.id} :`, dbErr.message);
        }
        console.error(`❌ Échec provisioning de la VM ${dto.name}: ${err.message}`);
      });

    return {
      message: "Le déploiement de votre machine a commencé.",
      vmId: savedVm.id,
      status: savedVm.status,
      vm: savedVm,
    };
  }

  private async syncVmRuntimeStatus(vm: MachineVirtuelle): Promise<MachineVirtuelle> {
    if (vm.status === ServiceStatus.FAILED) {
      return vm; // Ne pas essayer de synchroniser ou d'adopter une VM échouée
    }

    const esxiName = `${vm.nomPersonnalise}-${vm.id}`;
    const runtime = await this.esxiService.getVmRuntime(
      vm.vmReference || vm.nomPersonnalise,
      esxiName,
    );

    if (!runtime) {
      // Fallback pour les anciennes VMs
      const fallbackRuntime = await this.esxiService.getVmRuntime(
        vm.vmReference || vm.nomPersonnalise,
        vm.nomPersonnalise,
      );
      if (!fallbackRuntime) {
        return vm;
      }
      return this.applyRuntimeUpdates(vm, fallbackRuntime);
    }

    return this.applyRuntimeUpdates(vm, runtime);
  }

  private async applyRuntimeUpdates(vm: MachineVirtuelle, runtime: any): Promise<MachineVirtuelle> {
    if (vm.status === ServiceStatus.AWAITING_PAYMENT) {
      // Ne pas écraser le statut "AWAITING_PAYMENT" lors de la synchronisation
      return vm;
    }

    const runtimeStatus = this.mapPowerStateToStatus(runtime.state);
    const updates: Partial<MachineVirtuelle> = {};

    if (runtimeStatus && vm.status !== runtimeStatus) {
      updates.status = runtimeStatus;
      vm.status = runtimeStatus;
    }

    if ((!vm.vmReference || vm.vmReference.startsWith('task-')) && runtime.id) {
      updates.vmReference = runtime.id;
      vm.vmReference = runtime.id;
    }

    if (runtime.ipAddress && vm.ipAddress !== runtime.ipAddress) {
      updates.ipAddress = runtime.ipAddress;
      vm.ipAddress = runtime.ipAddress;
    }

    if (Object.keys(updates).length > 0) {
      await this.vmRepo.update(vm.id, updates);
    }

    const metrics = runtimeStatus === ServiceStatus.RUNNING
      ? await this.esxiService.getVmSummaryMetricsBySsh(runtime.id || vm.vmReference)
      : null;

    (vm as any).cpuUse = runtimeStatus === ServiceStatus.RUNNING ? (metrics?.cpuUse ?? null) : null;
    (vm as any).ramUse = runtimeStatus === ServiceStatus.RUNNING ? (metrics?.ramUse ?? null) : null;
    (vm as any).cpuUsageMhz = metrics?.cpuUsageMhz ?? null;
    (vm as any).ramUsageMb = metrics?.ramUsageMb ?? null;

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

  @Get('machine-virtuelle/:id/console')
  async recupererTicket(@Param('id') id: string) {
    return await this.esxiService.obtenirTicketConsole(id);
  }
}
