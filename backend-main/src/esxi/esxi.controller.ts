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
import { MetricsService } from 'src/metrics/metrics.service';

import { IsString, IsNumber, IsOptional, Length, Matches } from 'class-validator';

export class CreateVmDto {
  @IsString()
  @Length(3, 32, { message: "Le nom d'instance doit contenir entre 3 et 32 caractères." })
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: "Le nom d'instance ne peut contenir que des lettres, des chiffres, des tirets (-) et des underscores (_)." })
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

import { Demande, DemandeStatus } from 'src/demande/entities/demande.entity';

@Controller('esxi')
export class EsxiController {
  constructor(private readonly esxiService: EsxiService,
    @InjectRepository(MachineVirtuelle)
    private readonly vmRepo: Repository<MachineVirtuelle>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Catalogue)
    private readonly catalogueRepo: Repository<Catalogue>,
    @InjectRepository(Demande)
    private readonly demandeRepo: Repository<Demande>,
    private readonly walletService: WalletService,
    private readonly mailService: MailService,
    private readonly metricsService: MetricsService,
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

  @Get('templates')
  async getTemplates() {
    try {
      const vms = await this.esxiService.getVms();
      const templates = vms.filter(vm => vm.name && vm.name.toLowerCase().includes('template'));
      return {
        status: 'Success',
        count: templates.length,
        data: templates,
      };
    } catch (error) {
      throw new HttpException({
        status: 'Error',
        message: 'Impossible de récupérer les templates ESXi',
        details: error.message,
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // 🔍 Endpoint de debug temporaire — retourne les données SOAP brutes d'une VM spécifique
  @Get('vms-raw-debug/:vmId')
  async getRawVmDebug(@Param('vmId') vmId: string) {
    return this.esxiService.getRawGuestInfo(vmId);
  }
  @Post('power/:id')
  async togglePower(@Param('id') id: string, @Body('action') action: 'start' | 'stop' | 'restart' | 'reboot' | 'suspend') {
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
      return await this.esxiService.getHostStats();
    } catch (error) {
      throw new HttpException(
        { status: 'Error', message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-vms')
  async getMyVms(@Req() req: any) {
    const clientId = req.user.sub;
    const vms = await this.vmRepo.find({
      where: { client: { id: clientId } },
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
    @Body('action') action: 'start' | 'stop' | 'restart' | 'reboot' | 'suspend',
    @Req() req: any,
  ) {
    if (!action || !['start', 'stop', 'restart', 'reboot', 'suspend'].includes(action)) {
      throw new HttpException(
        { status: 'Error', message: 'Action invalide. Utilisez "start", "stop", "restart" ou "suspend".' },
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

    const targetStatus = (action === 'start' || action === 'restart') ? ServiceStatus.RUNNING : ServiceStatus.STOPPED;
    await this.vmRepo.update(vm.id, { status: targetStatus });
    vm.status = targetStatus;

    return {
      status: 'Success',
      message: `VM ${vm.nomPersonnalise} action ${action} exécutée avec succès.`,
      vmId: id,
      newStatus: targetStatus,
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
  @Post('my-vms/:id/upgrade')
  async upgradeMyVm(
    @Param('id', ParseIntPipe) id: number,
    @Body('catalogueId', ParseIntPipe) catalogueId: number,
    @Req() req: any,
  ) {
    const vm = await this.vmRepo.findOne({
      where: { id, client: { id: req.user.sub } },
      relations: ['client', 'catalogue', 'client.entreprise'],
    });

    if (!vm) {
      throw new NotFoundException('VM introuvable pour ce client.');
    }

    const newCatalogue = await this.catalogueRepo.findOne({ where: { id: catalogueId, isActive: true } });
    if (!newCatalogue) {
      throw new NotFoundException('Nouvelle offre introuvable ou inactive.');
    }

    const oldPrice = Number(vm.prixMensuel) || 0;
    const newPrice = Number(newCatalogue.prix) || 0;

    if (newPrice <= oldPrice) {
      throw new HttpException(
        { status: 'Error', message: 'La nouvelle offre doit avoir un prix supérieur à l\'offre actuelle.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const diffPrice = newPrice - oldPrice;
    const oldPlanName = vm.catalogue?.nomService ?? `${vm.vCPU} vCPU / ${vm.ramGB} GB RAM`;

    // Déterminer qui débiter : si ENTREPRISE_USER → débiter l'admin de l'entreprise
    const isEntUser = req.user.role === 'ENTREPRISE_USER';
    let debitClientId = req.user.sub;
    let adminClient: any = null;

    if (isEntUser && vm.client?.entreprise) {
      // Trouver l'admin de la même entreprise
      adminClient = await this.clientRepo.findOne({
        where: { entreprise: { id: vm.client.entreprise.id }, role: 'ENTREPRISE_ADMIN' as any },
      });
      if (adminClient) {
        debitClientId = adminClient.id;
      }
    }

    // Débiter la différence
    try {
      await this.walletService.debiter(
        debitClientId,
        diffPrice,
        `Mise à niveau (Scale-up) de la VM IaaS ${vm.nomPersonnalise}${isEntUser ? ` par ${vm.client.prenom} ${vm.client.nom}` : ''}`,
        undefined,
      );
    } catch (walletErr) {
      throw new HttpException(
        { status: 'Error', message: `Solde insuffisant pour la mise à niveau. Différence à payer: ${diffPrice.toFixed(3)} DT.` },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const esxiRef = vm.vmReference || vm.nomPersonnalise;

    try {
      const ramInMb = Math.round(newCatalogue.ramMB * 1024);
      await this.esxiService.upgradeVm(esxiRef, newCatalogue.vcpu, ramInMb, newCatalogue.stockageGB);
    } catch (error) {
      throw new HttpException(
        { status: 'Error', message: `Échec de la mise à niveau sur l'infrastructure: ${error.message}` },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Mise à jour de la base de données
    vm.catalogue = newCatalogue;
    vm.prixMensuel = newPrice;
    vm.vCPU = newCatalogue.vcpu;
    vm.ramGB = newCatalogue.ramMB;
    vm.stockageGB = newCatalogue.stockageGB;
    await this.vmRepo.save(vm);

    const demande = await this.demandeRepo.findOne({
      where: {
        nomInstanceSouhaite: vm.nomPersonnalise,
        client: { id: vm.client.id },
        status: DemandeStatus.APPROUVEE
      }
    });
    if (demande) {
      demande.catalogue = newCatalogue;
      demande.prixMensuel = newPrice;
      await this.demandeRepo.save(demande);
    }

    // Si ENTREPRISE_USER, envoyer une notification email à l'admin
    if (isEntUser && adminClient) {
      this.mailService.sendUpgradeNotificationAdmin({
        adminEmail: adminClient.email,
        adminPrenom: adminClient.prenom,
        userPrenom: vm.client.prenom,
        userNom: vm.client.nom,
        resourceName: vm.nomPersonnalise,
        resourceType: 'VM',
        oldPlan: oldPlanName,
        newPlan: newCatalogue.nomService,
        diffPrice,
      }).catch(() => {});
    }

    return {
      status: 'Success',
      message: `VM ${vm.nomPersonnalise} mise à niveau avec succès.`,
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

    // 1. VÉRIFICATION DU NOM (Sécurité, limite de caractères et conflits)
    const sanitizedName = (dto.name || '').trim();
    if (!sanitizedName || sanitizedName.length < 3 || sanitizedName.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(sanitizedName)) {
      throw new BadRequestException("Le nom d'instance doit comporter entre 3 et 32 caractères alphanumériques (a-z, 0-9, tirets et underscores uniquement).");
    }
    if (sanitizedName.toLowerCase().startsWith('template')) {
      throw new BadRequestException("Le nom d'instance ne peut pas commencer par \"template\" (mot-clé réservé par le système).");
    }
    dto.name = sanitizedName;

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
              `Déploiement d'une infrastructure IaaS (Machine Virtuelle)`,
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

  private async syncVmRuntimeStatus(vm: MachineVirtuelle, skipMetrics = false): Promise<MachineVirtuelle> {
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
      return this.applyRuntimeUpdates(vm, fallbackRuntime, skipMetrics);
    }

    return this.applyRuntimeUpdates(vm, runtime, skipMetrics);
  }

  private async applyRuntimeUpdates(vm: MachineVirtuelle, runtime: any, skipMetrics = false): Promise<MachineVirtuelle> {
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

    if (skipMetrics) {
      return vm;
    }

    const metrics = runtimeStatus === ServiceStatus.RUNNING
      ? await this.esxiService.getVmSummaryMetricsBySsh(runtime.id || vm.vmReference)
      : null;

    const cpuVal = runtimeStatus === ServiceStatus.RUNNING ? (metrics?.cpuUse ?? null) : null;
    const ramVal = runtimeStatus === ServiceStatus.RUNNING ? (metrics?.ramUse ?? null) : null;
    (vm as any).cpuUse = cpuVal;
    (vm as any).ramUse = ramVal;
    (vm as any).cpuUsageMhz = metrics?.cpuUsageMhz ?? null;
    (vm as any).ramUsageMb = metrics?.ramUsageMb ?? null;

    if (runtimeStatus === ServiceStatus.RUNNING && cpuVal !== null && ramVal !== null) {
      this.metricsService.recordMetric('IAAS', vm.id, cpuVal, ramVal, metrics?.ramUsageMb ?? undefined);
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

  @Get('machine-virtuelle/:id/console')
  async recupererTicket(@Param('id') id: string) {
    return await this.esxiService.obtenirTicketConsole(id);
  }
}
