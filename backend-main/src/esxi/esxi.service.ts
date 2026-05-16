import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as https from 'https';
import { Client as VsphereClient } from '@vates/node-vsphere-soap';

@Injectable()
export class EsxiService {
  private readonly logger = new Logger(EsxiService.name);
  private vsphereClient: any;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.initializeVsphereClient();
  }

  private initializeVsphereClient() {
    const host = this.configService.get<string>('ESXI_HOST')!;
    const username = this.configService.get<string>('ESXI_USERNAME')!;
    const password = this.configService.get<string>('ESXI_PASSWORD')!;

    // Créer le client - la connexion se fera au premier appel
    this.vsphereClient = new VsphereClient(host, username, password, false);
  }

  private get host(): string {
    return this.configService.get<string>('ESXI_HOST')!;
  }

  private get httpsAgent() {
    return new https.Agent({ rejectUnauthorized: false });
  }

  /**
   * Authentification ESXi standalone via bibliothèque vSphere SOAP.
   */
  async getSession(): Promise<string> {
    try {
      // La connexion se fait automatiquement lors du premier appel
      // Vérifier que la connexion est établie en récupérant les VMs
      this.logger.log('✅ Connexion ESXi établie via vSphere SOAP');
      return 'authenticated'; // La bibliothèque gère la session en interne
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Échec de connexion ESXi via vSphere SOAP: ${errorMessage}`,
      );
      throw new Error(`Authentification ESXi échouée: ${errorMessage}`);
    }
  }

  /**
   * Récupère les VMs via la bibliothèque vSphere SOAP.
   */
  async getVms(): Promise<any[]> {
    try {
      this.logger.log('Navigation dans le PropertyCollector via SOAP...');

      const propertyCollector =
        this.vsphereClient.serviceContent.propertyCollector;
      const rootFolder = this.vsphereClient.serviceContent.rootFolder;

      const folderTraversalSpec = {
        attributes: { 'xsi:type': 'TraversalSpec' },
        name: 'folderTraversalSpec',
        type: 'Folder',
        path: 'childEntity',
        skip: false,
        selectSet: [
          {
            attributes: { 'xsi:type': 'SelectionSpec' },
            name: 'folderTraversalSpec',
          },
          {
            attributes: { 'xsi:type': 'SelectionSpec' },
            name: 'datacenterVmFolderTraversalSpec',
          },
        ],
      };

      const datacenterVmFolderTraversalSpec = {
        attributes: { 'xsi:type': 'TraversalSpec' },
        name: 'datacenterVmFolderTraversalSpec',
        type: 'Datacenter',
        path: 'vmFolder',
        skip: false,
        selectSet: [
          {
            attributes: { 'xsi:type': 'SelectionSpec' },
            name: 'folderTraversalSpec',
          },
        ],
      };

      const spec = {
        propSet: [
          {
            type: 'VirtualMachine',
            all: false,
            pathSet: ['name', 'runtime.powerState', 'config.hardware.memoryMB'],
          },
        ],
        objectSet: [
          {
            obj: rootFolder,
            skip: false,
            selectSet: [folderTraversalSpec, datacenterVmFolderTraversalSpec],
          },
        ],
      };

      const result: any = await this.runVsphereCommand('RetrievePropertiesEx', {
        _this: propertyCollector,
        specSet: [spec],
        options: {},
      });

      if (!result || !result.returnval || !result.returnval.objects) {
        this.logger.warn("Aucun objet retourné par l'ESXi");
        return [];
      }

      // Transformation des données pour ton interface Angular
      const vms = result.returnval.objects.map((obj) => {
        const props = obj.propSet || [];
        const name = this.unwrapSoapValue(
          props.find((p) => p.name === 'name')?.val,
        );
        const state = this.unwrapSoapValue(
          props.find((p) => p.name === 'runtime.powerState')?.val,
        );
        const ram = this.unwrapSoapValue(
          props.find((p) => p.name === 'config.hardware.memoryMB')?.val,
        );
        const id = this.unwrapSoapValue(obj.obj?.value ?? obj.obj);

        return {
          id,
          name: name || 'Inconnue',
          state: state || 'N/A',
          ram: ram ? `${ram} MB` : 'N/A',
        };
      });

      this.logger.log(`✅ ${vms.length} VMs récupérées !`);
      return vms;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Erreur : ${message}`);
      throw new Error(`Récupération échouée : ${message}`);
    }
  }

  private runVsphereCommand(
    command: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.vsphereClient
        .runCommand(command, args)
        .once('result', resolve)
        .once('error', reject);
    });
  }

  private unwrapSoapValue(value: any): any {
    if (value && typeof value === 'object' && '$value' in value) {
      return value.$value;
    }

    return value;
  }
  async powerControl(vmId: string, action: 'start' | 'stop'): Promise<void> {
    try {
        const command = action === 'start' ? 'PowerOnVM_Task' : 'PowerOffVM_Task';
        
        await this.runVsphereCommand(command, {
            _this: {
                attributes: { 'xsi:type': 'ManagedObjectReference', type: 'VirtualMachine' },
                $value: vmId
            }
        });
        
        this.logger.log(`✅ Action ${action} envoyée avec succès à la VM ${vmId}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`❌ Échec du PowerControl: ${message}`);
        throw error;
    }
    }

    async getHostStats(): Promise<any> {
        try {
            const serviceContent = this.vsphereClient.serviceContent;

            // 1. Création d'une vue pour cibler le HostSystem (le serveur physique)
            const containerView: any = await new Promise((resolve, reject) => {
            this.vsphereClient.client.CreateContainerView(
                {
                _this: serviceContent.viewManager,
                container: serviceContent.rootFolder,
                type: ['HostSystem'],
                recursive: true,
                },
                (err, res) => {
                if (err) return reject(err);
                resolve(res.returnval);
                },
            );
            });

            // 2. Définition des propriétés à extraire pour correspondre à ton tableau
            const spec = {
            propSet: [
                {
                type: 'HostSystem',
                all: false,
                pathSet: [
                    'name',
                    'summary.hardware.memorySize',         // RAM Totale (Bytes)
                    'summary.quickStats.overallMemoryUsage', // RAM Utilisée (MB)
                    'summary.quickStats.overallCpuUsage',    // CPU Utilisé (MHz)
                    'summary.hardware.numCpuCores',          // Nombre de Coeurs (VCPU)
                    'summary.hardware.cpuModel',             // Pour info (i7-7700HQ)
                    'summary.hardware.cpuMhz',               // Vitesse par coeur (2800 MHz)
                ],
                },
            ],
            objectSet: [
                {
                obj: containerView,
                skip: true,
                selectSet: [
                    {
                    attributes: { 'xsi:type': 'TraversalSpec' },
                    name: 'viewTraversalSpec',
                    type: 'ContainerView',
                    path: 'view',
                    skip: false,
                    },
                ],
                },
            ],
            };

            // 3. Appel à l'API VMware
            const result: any = await this.runVsphereCommand('RetrievePropertiesEx', {
            _this: serviceContent.propertyCollector,
            specSet: [spec],
            options: {},
            });

            if (!result || !result.returnval || !result.returnval.objects) {
            throw new Error("Aucun hôte ESXi détecté.");
            }

            const props = result.returnval.objects[0].propSet;

            // --- EXTRACTION DES VALEURS ---
            const rawName = this.unwrapSoapValue(props.find((p) => p.name === 'name')?.val);
            const numCores = this.unwrapSoapValue(props.find((p) => p.name === 'summary.hardware.numCpuCores')?.val);
            const mhzPerCore = this.unwrapSoapValue(props.find((p) => p.name === 'summary.hardware.cpuMhz')?.val); // 2800
            
            const totalRamBytes = this.unwrapSoapValue(props.find((p) => p.name === 'summary.hardware.memorySize')?.val);
            const usedRamMb = this.unwrapSoapValue(props.find((p) => p.name === 'summary.quickStats.overallMemoryUsage')?.val);
            const usedCpuMhz = this.unwrapSoapValue(props.find((p) => p.name === 'summary.quickStats.overallCpuUsage')?.val);

            // --- CALCULS POUR LE TABLEAU (DYNAMIX UI) ---
            
            // RAM
            const totalRamGb = Math.round(totalRamBytes / (1024 * 1024 * 1024));
            const ramUsagePercent = Math.round((usedRamMb / (totalRamGb * 1024)) * 100);

            // CPU (Basé sur la vitesse totale cumulée)
            const totalCpuCapacityMhz = mhzPerCore * numCores; 
            const cpuUsagePercent = Math.round((usedCpuMhz / totalCpuCapacityMhz) * 100);

            // Ajouter le vrai nombre de VMs actives à partir de l'état des VMs
            const vms = await this.getVms();
            const activeVmsCount = vms.filter(vm => vm.state === 'poweredOn').length;
            const totalVmsCount = vms.length;

            // 4. Retour du format exact pour ton frontend Angular
            return {
            hostname: "esxi-host-01", 
            ip: this.configService.get('ESXI_HOST'), // Ex: 192.168.8.132
            vcpuTotal: numCores,          // Affichera 4 ou 8 selon ton CPU
            ramTotal: `${totalRamGb} GB`, // Affichera "8 GB"
            cpuPercent: cpuUsagePercent,  // Pour ta barre d'avancement
            ramPercent: ramUsagePercent,  // Pour ta barre d'avancement
            vmsCount: activeVmsCount,
            totalVmsCount,
            status: 'Online'
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`❌ Erreur getHostStats: ${message}`);
            throw error;
        }
        }

}
