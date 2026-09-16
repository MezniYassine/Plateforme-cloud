import { Injectable, OnModuleInit, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from 'src/entities/client.entity';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { RoleClient } from 'src/enum/role-client.enum';
import { EsxiService } from 'src/esxi/esxi.service';
import { LogsService } from 'src/logs/logs.service';
import { LogSource } from 'src/enum/log-source.enum';

@Injectable()
export class TenantNetworkService implements OnModuleInit {
  private readonly logger = new Logger(TenantNetworkService.name);
  private readonly POOL_SIZE = 100;
  public static readonly DEFAULT_NETWORK = 'VM Network';

  constructor(
    @InjectRepository(MachineVirtuelle)
    private readonly vmRepo: Repository<MachineVirtuelle>,
    @Optional()
    @Inject(forwardRef(() => EsxiService))
    private readonly esxiService?: EsxiService,
    @Optional()
    @Inject(forwardRef(() => LogsService))
    private readonly logsService?: LogsService,
  ) {}

  async onModuleInit() {
    this.logger.log('Vérification de l\'état de la passerelle Cloud-Gateway sur l\'ESXi...');
    if (!this.esxiService) return;
    try {
      const vms = await this.esxiService.getVms();
      const gatewayVm = vms.find(
        (vm) =>
          vm.name?.toLowerCase().includes('cloud-gateway') ||
          vm.name?.toLowerCase() === 'gateway',
      );

      if (gatewayVm) {
        if (gatewayVm.state !== 'poweredOn') {
          this.logger.warn('⚠️ La passerelle Cloud-Gateway est éteinte. Tentative de démarrage...');
          await this.esxiService.powerControl(gatewayVm.id, 'start');
          this.logger.log('✅ Ordre de démarrage envoyé pour la passerelle Cloud-Gateway.');
          await this.logsService?.logWarn(
            LogSource.GATEWAY,
            'La passerelle réseau Cloud-Gateway était éteinte au démarrage du serveur. Ordre de démarrage automatique transmis.',
            { state: gatewayVm.state },
            { serviceType: 'INFRASTRUCTURE', resourceName: 'Cloud-Gateway' },
          );
        } else {
          this.logger.log('✅ La passerelle Cloud-Gateway est déjà en cours d\'exécution.');
        }
      } else {
        this.logger.warn('⚠️ Attention : Aucune machine nommée "Cloud-Gateway" n\'a été trouvée sur l\'ESXi.');
        await this.logsService?.logWarn(
          LogSource.GATEWAY,
          'Aucune machine virtuelle nommée "Cloud-Gateway" n\'a été détectée sur l\'ESXi.',
          undefined,
          { serviceType: 'INFRASTRUCTURE', resourceName: 'Cloud-Gateway' },
        );
      }
    } catch (error: any) {
      this.logger.error(`Erreur lors de la vérification de la passerelle Cloud-Gateway : ${error.message}`);
      await this.logsService?.logCritical(
        LogSource.GATEWAY,
        `Erreur lors de la vérification de Cloud-Gateway sur l'ESXi : ${error.message}`,
        error?.stack,
        { serviceType: 'INFRASTRUCTURE', resourceName: 'Cloud-Gateway' },
      );
    }
  }

  /**
   * Résout ou attribue automatiquement un réseau isolé (Port Group Terraform / VLAN)
   * pour TOUS les utilisateurs : ENTREPRISES et PARTICULIERS (PERSONNEL).
   * 
   * 🔒 Règles d'isolation :
   * 1. PARTICULIERS (Type Personnel) :
   *    Chaque utilisateur personnel a son PROPRE Port Group / VLAN dédié (ex: PG-Tenant-01).
   *    Si le même particulier crée plusieurs VMs, elles partagent son réseau pour communiquer entre elles.
   *    Deux particuliers différents reçoivent deux Port Groups / VLANs étanches distincts.
   * 
   * 2. ENTREPRISES :
   *    Chaque entreprise a son PROPRE Port Group / VLAN dédié (ex: PG-Tenant-02).
   *    Tous les collaborateurs de cette même entreprise partagent ce réseau d'entreprise.
   *    Deux entreprises différentes reçoivent deux Port Groups / VLANs étanches distincts.
   */
  async resolveNetworkForClient(client: Client): Promise<string> {
    const isEntreprise = Boolean(client.entreprise?.id && client.role !== RoleClient.PERSONNEL);
    const entrepriseId = client.entreprise?.id;
    const clientId = client.id;

    // 1. Vérifier si ce tenant (Entreprise ou Particulier) a déjà une VM avec un réseau assigné
    const existingTenantVm = await this.vmRepo.findOne({
      where: isEntreprise
        ? { client: { entreprise: { id: entrepriseId } } }
        : { client: { id: clientId } },
      order: { id: 'DESC' },
    });

    if (existingTenantVm?.networkName && existingTenantVm.networkName.startsWith('PG-Tenant-')) {
      return existingTenantVm.networkName;
    }

    // 2. Trouver les réseaux déjà occupés en base de données par d'autres tenants
    const vmsWithNetwork = await this.vmRepo
      .createQueryBuilder('vm')
      .select('DISTINCT vm.networkName', 'networkName')
      .where('vm.networkName LIKE :prefix', { prefix: 'PG-Tenant-%' })
      .getRawMany();

    const usedNetworks = new Set<string>(
      vmsWithNetwork.map((v) => v.networkName).filter(Boolean),
    );

    // 3. Attribution du premier slot libre dans le pool Terraform (PG-Tenant-01 à PG-Tenant-30)
    for (let i = 1; i <= this.POOL_SIZE; i++) {
      const candidate = `PG-Tenant-${String(i).padStart(2, '0')}`;
      if (!usedNetworks.has(candidate)) {
        return candidate;
      }
    }

    // 4. Fallback si le pool est saturé : répartition déterministe
    const tenantKey = isEntreprise ? (entrepriseId! * 7) : (clientId * 13);
    const slotNumber = ((tenantKey - 1) % this.POOL_SIZE) + 1;
    return `PG-Tenant-${String(slotNumber).padStart(2, '0')}`;
  }

  /**
   * OPTION A - Adressage IP statique par VLAN :
   * Dérive un sous-réseau privé 192.168.{VLAN}.0/24 (ou 10.{VLAN}.0.0/24)
   * et alloue la première adresse IP disponible (ex: 192.168.101.10, 192.168.101.11...).
   */
  async resolveStaticIpForNetwork(networkName: string): Promise<string> {
    if (!networkName || networkName === TenantNetworkService.DEFAULT_NETWORK) {
      return '';
    }

    if (networkName === 'PG-DBaaS-PaaS') {
      return this.findNextAvailableIp(50, networkName);
    }

    const match = networkName.match(/^PG-Tenant-(\d+)$/i);
    const slotNumber = match ? parseInt(match[1], 10) : 1;
    const vlanId = 100 + slotNumber; // PG-Tenant-01 -> VLAN 101

    return this.findNextAvailableIp(vlanId, networkName);
  }

  private async findNextAvailableIp(vlanId: number, networkName: string): Promise<string> {
    const existingVms = await this.vmRepo.find({
      where: { networkName },
      select: ['ipAddress'],
    });

    const usedIps = new Set<string>(
      existingVms.map((vm) => vm.ipAddress).filter(Boolean),
    );

    // Plage d'attribution : de .10 à .250 (ex: 192.168.101.10, 192.168.101.11...)
    for (let host = 10; host <= 250; host++) {
      const candidateIp = `192.168.${vlanId}.${host}`;
      if (!usedIps.has(candidateIp)) {
        return candidateIp;
      }
    }

    return `192.168.${vlanId}.254`;
  }
}
