import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as https from 'https';
import { Client as VsphereClient } from '@vates/node-vsphere-soap';
import { NodeSSH } from 'node-ssh';

export interface VmSshSummaryMetrics {
    cpuUse: number;
    ramUse: number;
    cpuUsageMhz?: number;
    ramUsageMb?: number;
}

@Injectable()
export class EsxiService {
    private readonly logger = new Logger(EsxiService.name);
    private vsphereClient: any;
    private clientReadyPromise: Promise<void> | null = null;

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

        this.clientReadyPromise = new Promise((resolve, reject) => {
            this.vsphereClient.once('ready', resolve);
            this.vsphereClient.once('error', (err: any) => {
                this.clientReadyPromise = null; // Reset to allow retry on next request
                reject(err);
            });
        });
    }

    private async ensureClientReady(): Promise<void> {
        if (!this.clientReadyPromise) {
            this.initializeVsphereClient();
        }
        await this.clientReadyPromise;
    }

    private get host(): string {
        return this.configService.get<string>('ESXI_HOST')!;
    }

    private get httpsAgent() {
        return new https.Agent({ rejectUnauthorized: false });
    }

    private get sshHost(): string {
        return this.configService.get<string>('ESXI_SSH_HOST') || this.host;
    }

    private get sshUsername(): string {
        return this.configService.get<string>('ESXI_SSH_USERNAME') || this.configService.get<string>('ESXI_USERNAME')!;
    }

    private get sshPassword(): string {
        return this.configService.get<string>('ESXI_SSH_PASSWORD') || this.configService.get<string>('ESXI_PASSWORD')!;
    }

    private get sshPort(): number {
        return Number(this.configService.get<string>('ESXI_SSH_PORT') || 22);
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
            await this.ensureClientReady();
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
                        pathSet: ['name', 'runtime.powerState', 'config.hardware.memoryMB', 'guest.ipAddress', 'summary.guest.ipAddress', 'guest.net'],
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

                // Tentative 1 : guest.ipAddress (principal)
                let ipAddress = this.unwrapSoapValue(
                    props.find((p) => p.name === 'guest.ipAddress')?.val,
                );

                // Tentative 2 : summary.guest.ipAddress
                if (!ipAddress) {
                    ipAddress = this.unwrapSoapValue(
                        props.find((p) => p.name === 'summary.guest.ipAddress')?.val,
                    );
                }

                // Tentative 3 : guest.net (liste des NIC avec leurs IPs)
                if (!ipAddress) {
                    const guestNetRaw = props.find((p) => p.name === 'guest.net')?.val;
                    if (guestNetRaw) {
                        // guest.net peut être un tableau de GuestNicInfo ou un objet unique
                        const nicList = Array.isArray(guestNetRaw)
                            ? guestNetRaw
                            : Array.isArray(guestNetRaw?.GuestNicInfo)
                                ? guestNetRaw.GuestNicInfo
                                : [guestNetRaw];

                        for (const nic of nicList) {
                            const ipConfig = nic?.ipConfig?.ipAddress;
                            const addresses = Array.isArray(ipConfig)
                                ? ipConfig
                                : ipConfig
                                    ? [ipConfig]
                                    : [];
                            // Prendre la première IPv4 qui n'est pas une loopback
                            const found = addresses.find((a: any) => {
                                const ip = this.unwrapSoapValue(a?.ipAddress ?? a);
                                return typeof ip === 'string' && !ip.startsWith('169.') && !ip.startsWith('127.') && ip.includes('.');
                            });
                            if (found) {
                                ipAddress = this.unwrapSoapValue(found?.ipAddress ?? found);
                                break;
                            }
                        }
                    }
                }

                const id = this.unwrapSoapValue(obj.obj?.value ?? obj.obj);

                // this.logger.debug(`VM [${name}] id=${id} state=${state} ip=${ipAddress ?? 'null (VMware Tools non prêts?)'}`);

                return {
                    id,
                    name: name || 'Inconnue',
                    state: state || 'N/A',
                    ram: ram ? `${ram} MB` : 'N/A',
                    ipAddress: ipAddress || null,
                };
            });

            return vms;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`❌ Erreur : ${message}`);
            throw new Error(`Récupération échouée : ${message}`);
        }
    }

    private async runVsphereCommand(
        command: string,
        args: Record<string, unknown>,
        retryCount = 0
    ): Promise<unknown> {
        await this.ensureClientReady();
        try {
            return await new Promise((resolve, reject) => {
                this.vsphereClient
                    .runCommand(command, args)
                    .once('result', resolve)
                    .once('error', reject);
            });
        } catch (error: any) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (retryCount === 0 && errorMsg.includes('NotAuthenticated')) {
                this.logger.warn('Session ESXi expirée. Reconnexion automatique en cours...');
                this.initializeVsphereClient();
                return this.runVsphereCommand(command, args, retryCount + 1);
            }
            throw error;
        }
    }

    private unwrapSoapValue(value: any): any {
        if (value && typeof value === 'object' && '$value' in value) {
            return value.$value;
        }

        return value;
    }

    /**
     * 🔍 DEBUG TEMPORAIRE — Retourne les données SOAP brutes d'une VM pour diagnostiquer l'IP nulle.
     * Appeler via GET /esxi/vms-raw-debug/:vmId (ex: vmId = "21")
     */
    async getRawGuestInfo(vmId: string): Promise<any> {
        const propertyCollector = this.vsphereClient.serviceContent.propertyCollector;
        const vmRef = {
            attributes: { 'xsi:type': 'ManagedObjectReference', type: 'VirtualMachine' },
            $value: vmId,
        };

        const result: any = await this.runVsphereCommand('RetrievePropertiesEx', {
            _this: propertyCollector,
            specSet: [{
                propSet: [{
                    type: 'VirtualMachine',
                    all: false,
                    pathSet: [
                        'name',
                        'runtime.powerState',
                        'guest.toolsStatus',
                        'guest.toolsRunningStatus',
                        'guest.ipAddress',
                        'summary.guest.ipAddress',
                        'guest.net',
                    ],
                }],
                objectSet: [{ obj: vmRef, skip: false }],
            }],
            options: {},
        });

        const props = result?.returnval?.objects?.[0]?.propSet ?? [];
        // Retourner toutes les props brutes pour voir ce qu'ESXi envoie vraiment
        return {
            vmId,
            rawProps: props.map((p: any) => ({ name: p.name, val: p.val })),
        };
    }

    async powerControl(vmId: string, action: 'start' | 'stop'): Promise<void> {
        // Résoudre le vrai MoRef ESXi (ex: "vm-5") à partir d'un nom ou d'une référence stockée
        const target = await this.resolveVmTarget(vmId, vmId);


        if (!target) {
            throw new Error(`VM "${vmId}" introuvable sur l'ESXi. Elle n'existe pas ou a été supprimée.`);
        }

        // Vérifier si l'action est déjà dans l'état souhaité
        const isAlreadyOn = target.state === 'poweredOn';
        const isAlreadyOff = target.state === 'poweredOff' || target.state === 'suspended';

        if (action === 'start' && isAlreadyOn) {
            this.logger.warn(`VM ${target.name} est déjà allumée, action ignorée.`);
            return;
        }
        if (action === 'stop' && isAlreadyOff) {
            this.logger.warn(`VM ${target.name} est déjà éteinte, action ignorée.`);
            return;
        }

        try {
            const command = action === 'start' ? 'PowerOnVM_Task' : 'PowerOffVM_Task';

            const taskResult: any = await this.runVsphereCommand(command, {
                _this: target.ref,
            });

            // Attendre la fin de la tâche ESXi
            await this.waitForTaskCompletion(taskResult?.returnval);

            this.logger.log(`✅ Action ${action} terminée avec succès pour la VM ${target.name} (${target.id})`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`❌ Échec du PowerControl pour ${target.name}: ${message}`);
            throw error;
        }
    }

    async getVmRuntime(vmReference?: string | null, vmName?: string): Promise<{ id: string; name: string; state: string; ipAddress?: string } | null> {
        const target = await this.resolveVmTarget(vmReference, vmName);

        if (!target) {
            return null;
        }

        return {
            id: target.id,
            name: target.name,
            state: target.state,
            ipAddress: target.ipAddress,
        };
    }

    async getVmSummaryMetricsBySsh(vmReference?: string | null): Promise<VmSshSummaryMetrics | null> {
        const vmId = this.normalizeVimCmdVmId(vmReference);

        if (!vmId) {
            return null;
        }

        const ssh = new NodeSSH();

        try {
            await ssh.connect({
                host: this.sshHost,
                username: this.sshUsername,
                password: this.sshPassword,
                port: this.sshPort,
                readyTimeout: 10000,
                tryKeyboard: true,
                onKeyboardInteractive: (_name, _instructions, _lang, prompts, finish) => {
                    finish(prompts.map(() => this.sshPassword));
                },
            });

            const result = await ssh.execCommand(`vim-cmd vmsvc/get.summary ${vmId}`);

            if (result.code !== 0 || result.stderr) {
                this.logger.warn(`vim-cmd get.summary ${vmId} a echoue: ${result.stderr || `code ${result.code}`}`);
                return null;
            }

            return this.parseVmSummaryMetrics(result.stdout);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Impossible de recuperer les metriques SSH de la VM ${vmId}: ${message}`);
            return null;
        } finally {
            ssh.dispose();
        }
    }

    private normalizeVimCmdVmId(vmReference?: string | null): string | null {
        const raw = vmReference?.trim();

        if (!raw) {
            return null;
        }

        const match = raw.match(/^(?:vm-)?(\d+)$/);
        return match?.[1] ?? null;
    }

    private parseVmSummaryMetrics(summary: string): VmSshSummaryMetrics | null {
        const memorySizeMb = this.extractSummaryNumber(summary, 'memorySizeMB');
        const overallCpuUsage = this.extractSummaryNumber(summary, 'overallCpuUsage');
        const maxCpuUsage = this.extractSummaryNumber(summary, 'maxCpuUsage');
        const guestMemoryUsage = this.extractSummaryNumber(summary, 'guestMemoryUsage');
        const hostMemoryUsage = this.extractSummaryNumber(summary, 'hostMemoryUsage');
        const usedMemoryMb = guestMemoryUsage ?? hostMemoryUsage;

        const cpuUse = overallCpuUsage !== null && maxCpuUsage !== null && maxCpuUsage > 0
            ? this.clampPercent(Math.round((overallCpuUsage / maxCpuUsage) * 100))
            : 0;
        const ramUse = usedMemoryMb !== null && memorySizeMb !== null && memorySizeMb > 0
            ? this.clampPercent(Math.round((usedMemoryMb / memorySizeMb) * 100))
            : 0;

        return {
            cpuUse,
            ramUse,
            cpuUsageMhz: overallCpuUsage ?? undefined,
            ramUsageMb: usedMemoryMb ?? undefined,
        };
    }

    private extractSummaryNumber(summary: string, key: string): number | null {
        const match = summary.match(new RegExp(`\\b${key}\\s*=\\s*(-?\\d+)`));
        return match ? Number(match[1]) : null;
    }

    private clampPercent(value: number): number {
        if (!Number.isFinite(value)) {
            return 0;
        }

        return Math.max(0, Math.min(100, value));
    }
    async deleteVm(vmReference?: string | null, vmName?: string): Promise<void> {
        const target = await this.resolveVmTarget(vmReference, vmName);

        if (!target) {
            this.logger.warn(`VM déjà absente sur ESXi: ${vmName ?? vmReference}`);
            return;
        }

        if (target.name.toLowerCase().startsWith('template')) {
            throw new Error('Refus de supprimer un template ESXi.');
        }

        if (target.state === 'poweredOn') {
            this.logger.log(`Extinction de ${target.name} avant suppression.`);
            const powerTaskResult: any = await this.runVsphereCommand('PowerOffVM_Task', {
                _this: target.ref,
            });
            await this.waitForTaskCompletion(powerTaskResult?.returnval);
        }

        this.logger.log(`Suppression ESXi de ${target.name} (${target.id}).`);
        const destroyResult: any = await this.runVsphereCommand('Destroy_Task', {
            _this: target.ref,
        });

        await this.waitForTaskCompletion(destroyResult?.returnval);
    }

    async getHostStats(): Promise<any> {
        try {
            await this.ensureClientReady();
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

            // --- EXTRACTION DATASTORE ---
            let storageUsagePercent = 0; // Default (will be updated dynamically below)
            try {
                const datastore = await this.getFirstMoRef('Datastore');
                if (datastore) {
                    const dsSpec = {
                        propSet: [{ type: 'Datastore', all: false, pathSet: ['summary.capacity', 'summary.freeSpace'] }],
                        objectSet: [{ obj: datastore }]
                    };
                    const dsResult: any = await this.runVsphereCommand('RetrievePropertiesEx', {
                        _this: serviceContent.propertyCollector, specSet: [dsSpec], options: {}
                    });
                    const dsProps = dsResult?.returnval?.objects?.[0]?.propSet;
                    const dsCapacity = Number(this.unwrapSoapValue(dsProps?.find((p: any) => p.name === 'summary.capacity')?.val));
                    const dsFree = Number(this.unwrapSoapValue(dsProps?.find((p: any) => p.name === 'summary.freeSpace')?.val));
                    if (dsCapacity > 0) {
                        storageUsagePercent = Math.round(((dsCapacity - dsFree) / dsCapacity) * 100);
                    }
                }
            } catch (dsErr) {
                this.logger.warn(`Impossible de récupérer les stats Datastore: ${dsErr.message}`);
            }

            // 4. Retour du format exact pour ton frontend Angular
            return {
                hostname: "esxi-host-01",
                ip: this.configService.get('ESXI_HOST'), // Ex: 192.168.8.132
                vcpuTotal: numCores,          // Affichera 4 ou 8 selon ton CPU
                ramTotal: `${totalRamGb} GB`, // Affichera "8 GB"
                cpuPercent: cpuUsagePercent,  // Pour ta barre d'avancement
                ramPercent: ramUsagePercent,  // Pour ta barre d'avancement
                storagePercent: storageUsagePercent, // NOUVEAU
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

    async cloneAndReconfigure(templateName: string, newName: string, ramMB: number, vcpu: number, storageGB?: number): Promise<any> {
        try {
            // 1. Récupérer les références nécessaires (Template, Folder, Pool, Datastore)
            const templateRef = await this.findMoRefByName('VirtualMachine', templateName);
            const resourcePool = await this.getFirstMoRef('ResourcePool');
            const datastore = await this.getFirstMoRef('Datastore');

            if (!templateRef) throw new Error(`Template "${templateName}" introuvable.`);
            const destinationFolder = await this.getVmFolder(templateRef);

            // 2. Définition de la spécification de clonage
            const cloneSpec = {
                // 1. D'abord la localisation
                location: {
                    datastore: datastore,
                    pool: resourcePool,
                },
                // 2. Ensuite l'indicateur template (OBLIGATOIRE)
                template: false,
                // 3. Enfin l'option de mise sous tension
                config: {
                    name: newName,
                    numCPUs: vcpu,
                    memoryMB: ramMB,
                },
                powerOn: false,
            };

            // 3. Appel de la tâche de clonage
            const taskRef: any = await new Promise((resolve, reject) => {
                this.vsphereClient.client.CloneVM_Task(
                    {
                        _this: templateRef,
                        folder: destinationFolder,
                        name: newName,
                        spec: cloneSpec,
                    },
                    (err, res) => {
                        if (err) {
                            this.logger.error(`Erreur SOAP Clone: ${err.message}`);
                            return reject(err);
                        }
                        // res.returnval contient le MoRef de la Task (ex: task-123)
                        resolve(res.returnval);
                    },
                );
            });

            const taskId = this.unwrapSoapValue(taskRef?.value ?? taskRef);
            this.logger.log(`🚀 Clonage démarré pour ${newName}. Task ID: ${taskId}`);
            try {
                await this.waitForTaskCompletion(taskRef);
            } catch (error) {
                if (this.isUnsupportedCloneError(error)) {
                    this.logger.warn('CloneVM_Task non supporté, fallback vers copie datastore + register VM.');
                    return this.cloneWithDatastoreCopy(templateRef, destinationFolder, resourcePool, newName, ramMB, vcpu, storageGB);
                }

                throw error;
            }
            this.logger.log(`✅ Clonage terminé pour ${newName}. Task ID: ${taskId}`);
            await this.resizeVmStorageByName(newName, storageGB);
            // Résoudre le vrai MoRef VMware de la VM clonée (ex: "13") pour le stocker en BDD
            const clonedVmRef = await this.findMoRefByName('VirtualMachine', newName);
            const vmMoRef: string | undefined = clonedVmRef?.$value;
            this.logger.log(`📌 vmReference stocké en BDD: ${vmMoRef ?? taskId}`);
            return vmMoRef ?? taskId;
        } catch (error) {
            this.logger.error(`❌ Échec cloneAndReconfigure: ${error.message}`);
            throw error;
        }
    }

    private async getVmFolder(vmRef: any): Promise<any> {
        await this.ensureClientReady();
        const serviceContent = this.vsphereClient.serviceContent;
        const result: any = await this.runVsphereCommand('RetrievePropertiesEx', {
            _this: serviceContent.propertyCollector,
            specSet: [
                {
                    propSet: [
                        { type: 'VirtualMachine', all: false, pathSet: ['parent'] },
                    ],
                    objectSet: [{ obj: vmRef, skip: false }],
                },
            ],
            options: {},
        });

        const folder = result?.returnval?.objects?.[0]?.propSet?.find(
            (prop: any) => prop.name === 'parent',
        )?.val;

        if (!folder) {
            throw new Error('Impossible de trouver le dossier parent du template.');
        }

        return folder;
    }

    private async cloneWithDatastoreCopy(
        templateRef: any,
        destinationFolder: any,
        resourcePool: any,
        newName: string,
        ramMB: number,
        vcpu: number,
        storageGB?: number,
    ): Promise<string> {
        const serviceContent = this.vsphereClient.serviceContent;
        const datacenter = await this.getFirstMoRef('Datacenter');
        const host = await this.getFirstMoRef('HostSystem');
        const templateVmxPath = await this.getVmPathName(templateRef);
        const { sourceFolderPath, destinationFolderPath, destinationVmxPath } =
            this.buildDatastoreClonePaths(templateVmxPath, newName);

        this.logger.log(`Copie datastore: ${sourceFolderPath} -> ${destinationFolderPath}`);
        const copyResult: any = await this.runVsphereCommand('CopyDatastoreFile_Task', {
            _this: serviceContent.fileManager,
            sourceName: sourceFolderPath,
            sourceDatacenter: datacenter,
            destinationName: destinationFolderPath,
            destinationDatacenter: datacenter,
            force: true, // Écrase le dossier de destination si déjà existant (évite les erreurs de verrouillage sur résidus de provisionnements échoués)
        });
        const copyTaskRef = copyResult?.returnval;

        await this.waitForTaskCompletion(copyTaskRef);
        const copyTaskId = this.unwrapSoapValue(copyTaskRef?.value ?? copyTaskRef);
        this.logger.log(`Copie datastore terminée. Task ID: ${copyTaskId}`);

        const registerResult: any = await this.runVsphereCommand('RegisterVM_Task', {
            _this: destinationFolder,
            path: destinationVmxPath,
            name: newName,
            asTemplate: false,
            pool: resourcePool,
            host,
        });
        const registerTaskRef = registerResult?.returnval;

        await this.waitForTaskCompletion(registerTaskRef);
        const registeredVm = await this.findMoRefByName('VirtualMachine', newName);

        if (!registeredVm) {
            throw new Error(`VM "${newName}" enregistrée mais introuvable après RegisterVM_Task.`);
        }

        const reconfigResult: any = await this.runVsphereCommand('ReconfigVM_Task', {
            _this: registeredVm,
            spec: {
                numCPUs: vcpu,
                memoryMB: ramMB,
            },
        });
        const reconfigTaskRef = reconfigResult?.returnval;

        await this.waitForTaskCompletion(reconfigTaskRef);
        await this.resizeVmStorageByName(newName, storageGB);
        return this.unwrapSoapValue(registeredVm?.value ?? registeredVm);
    }

    private async resizeVmStorageByName(vmName: string, storageGB?: number): Promise<void> {
        const requestedStorageGB = Number(storageGB);

        if (!Number.isFinite(requestedStorageGB) || requestedStorageGB <= 0) {
            return;
        }

        // Attendre 3 s pour laisser ESXi finaliser l'enregistrement de la VM
        // avant d'interroger ses périphériques (évite key=0 juste après le clonage)
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const vmRef = await this.findMoRefByName('VirtualMachine', vmName);

        if (!vmRef) {
            this.logger.warn(`VM "${vmName}" introuvable pour redimensionner le stockage — ignoré.`);
            return;
        }

        const deviceChange = await this.buildStorageDeviceChange(vmRef, requestedStorageGB);

        if (deviceChange.length === 0) {
            return;
        }

        try {
            const reconfigResult: any = await this.runVsphereCommand('ReconfigVM_Task', {
                _this: vmRef,
                spec: { deviceChange },
            });
            await this.waitForTaskCompletion(reconfigResult?.returnval);
            this.logger.log(`✅ Stockage de "${vmName}" redimensionné à ${requestedStorageGB} GB.`);
        } catch (error) {
            // Ne pas bloquer tout le provisionnement si seul le resize échoue
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`⚠️ Redimensionnement du stockage de "${vmName}" échoué (${message}) — la VM est provisionnée mais avec le stockage du template.`);
        }
    }

    private async buildStorageDeviceChange(vmRef: any, storageGB?: number): Promise<any[]> {
        const requestedStorageGB = Number(storageGB);

        if (!Number.isFinite(requestedStorageGB) || requestedStorageGB <= 0) {
            return [];
        }

        const disk = await this.getPrimaryVirtualDisk(vmRef);

        if (!disk) {
            this.logger.warn('Aucun disque virtuel trouvé pour redimensionnement — ignoré.');
            return [];
        }

        const currentCapacityKB = Number(this.unwrapSoapValue(disk.capacityInKB));
        const requestedCapacityKB = Math.round(requestedStorageGB * 1024 * 1024);

        // Log le disque brut pour faciliter le debug futur
        this.logger.debug(`Disque primaire trouvé: key=${JSON.stringify(disk.key)}, capacityInKB=${JSON.stringify(disk.capacityInKB)}, type=${disk.attributes?.['xsi:type'] ?? 'inconnu'}`);

        if (Number.isFinite(currentCapacityKB) && requestedCapacityKB <= currentCapacityKB) {
            this.logger.log(
                `Le stockage demandé (${requestedStorageGB} GB / ${requestedCapacityKB} KB) est inférieur ou égal à la capacité actuelle (${Math.round(currentCapacityKB / 1024 / 1024)} GB / ${currentCapacityKB} KB). Redimensionnement ignoré.`,
            );
            return [];
        }

        const updatedDisk = JSON.parse(JSON.stringify(disk));
        // Unwrap et forcer en entier — la clé SOAP peut arriver sous forme { $value: "2000" }
        const diskKey = parseInt(String(this.unwrapSoapValue(updatedDisk.key)), 10);

        if (!Number.isFinite(diskKey) || diskKey <= 0) {
            this.logger.warn(`Clé disque VMware invalide (${diskKey}) — redimensionnement du stockage ignoré pour éviter l'erreur "Invalid operation for device '0'"`);
            return [];
        }

        updatedDisk.key = diskKey;
        updatedDisk.capacityInKB = requestedCapacityKB;
        // S'assurer que le type xsi est correctement défini (obligatoire pour ReconfigVM_Task)
        updatedDisk.attributes = {
            ...(updatedDisk.attributes ?? {}),
            'xsi:type': 'VirtualDisk',
        };
        // Supprimer les champs qui peuvent invalider la requête SOAP sur ESXi standalone
        delete updatedDisk.shares;
        delete updatedDisk.storageIOAllocation;

        this.logger.log(`Stockage demandé: ${requestedStorageGB} GB (${updatedDisk.capacityInKB} KB), disque VMware key=${diskKey}`);

        return [
            {
                attributes: { 'xsi:type': 'VirtualDeviceConfigSpec' },
                operation: 'edit',
                device: updatedDisk,
            },
        ];
    }

    private async getPrimaryVirtualDisk(vmRef: any): Promise<any | null> {
        await this.ensureClientReady();
        const serviceContent = this.vsphereClient.serviceContent;
        const result: any = await this.runVsphereCommand('RetrievePropertiesEx', {
            _this: serviceContent.propertyCollector,
            specSet: [
                {
                    propSet: [
                        { type: 'VirtualMachine', all: false, pathSet: ['config.hardware.device'] },
                    ],
                    objectSet: [{ obj: vmRef, skip: false }],
                },
            ],
            options: {},
        });

        const rawDevices = result?.returnval?.objects?.[0]?.propSet?.find(
            (prop: any) => prop.name === 'config.hardware.device',
        )?.val;

        const devices = Array.isArray(rawDevices)
            ? rawDevices
            : Array.isArray(rawDevices?.VirtualDevice)
                ? rawDevices.VirtualDevice
                : Array.isArray(rawDevices?.device)
                    ? rawDevices.device
                    : [];

        return devices.find((device: any) => {
            const type = device?.attributes?.['xsi:type'] ?? device?.attributes?.type ?? device?.type;
            return type === 'VirtualDisk' || (device?.capacityInKB !== undefined && device?.backing);
        }) ?? null;
    }

    private async getVmPathName(vmRef: any): Promise<string> {
        await this.ensureClientReady();
        const serviceContent = this.vsphereClient.serviceContent;
        const result: any = await this.runVsphereCommand('RetrievePropertiesEx', {
            _this: serviceContent.propertyCollector,
            specSet: [
                {
                    propSet: [
                        { type: 'VirtualMachine', all: false, pathSet: ['config.files.vmPathName'] },
                    ],
                    objectSet: [{ obj: vmRef, skip: false }],
                },
            ],
            options: {},
        });

        const vmxPath = this.unwrapSoapValue(
            result?.returnval?.objects?.[0]?.propSet?.find(
                (prop: any) => prop.name === 'config.files.vmPathName',
            )?.val,
        );

        if (!vmxPath) {
            throw new Error('Impossible de trouver le chemin .vmx du template.');
        }

        return vmxPath;
    }

    private buildDatastoreClonePaths(templateVmxPath: string, newName: string) {
        const match = templateVmxPath.match(/^(\[[^\]]+\]\s+)(.+)\/([^/]+\.vmx)$/);

        if (!match) {
            throw new Error(`Chemin VMX VMware non supporté: ${templateVmxPath}`);
        }

        const datastorePrefix = match[1];
        const templateFolder = match[2];
        const vmxFileName = match[3];
        const parentPath = templateFolder.includes('/')
            ? `${templateFolder.slice(0, templateFolder.lastIndexOf('/'))}/`
            : '';
        const destinationFolder = `${parentPath}${newName}`;

        return {
            sourceFolderPath: `${datastorePrefix}${templateFolder}`,
            destinationFolderPath: `${datastorePrefix}${destinationFolder}`,
            destinationVmxPath: `${datastorePrefix}${destinationFolder}/${vmxFileName}`,
        };
    }

    private isUnsupportedCloneError(error: unknown): boolean {
        const message = error instanceof Error ? error.message : String(error);
        return message.includes('CloneVM_Task') && message.includes('pas supporté');
    }

    private async waitForTaskCompletion(taskRef: any, timeoutMs = 10 * 60 * 1000): Promise<void> {
        const startedAt = Date.now();
        let lastLoggedState: string | undefined;

        while (Date.now() - startedAt < timeoutMs) {
            const taskInfo = await this.getTaskInfo(taskRef);
            const state = this.unwrapSoapValue(taskInfo?.state);
            const taskId = this.unwrapSoapValue(taskRef?.value ?? taskRef);

            if (state && state !== lastLoggedState) {
                this.logger.debug(`Task VMware ${taskId}: ${state}`);
                lastLoggedState = state;
            }

            if (state === 'success') {
                return;
            }

            if (state === 'error') {
                const localizedMessage =
                    this.unwrapSoapValue(taskInfo?.error?.localizedMessage) ??
                    this.unwrapSoapValue(taskInfo?.error?.fault?.faultMessage?.[0]?.message) ??
                    JSON.stringify(taskInfo?.error);

                if (localizedMessage === 'The operation is not supported on the object.') {
                    throw new Error(
                        'CloneVM_Task n’est pas supporté par cet objet ESXi. Sur un ESXi standalone, le clonage SOAP direct nécessite généralement vCenter ; sinon il faut utiliser une stratégie de copie/register VM.',
                    );
                }

                throw new Error(`La tâche VMware a échoué: ${localizedMessage}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        throw new Error('Timeout: la tâche VMware de clonage est toujours en cours.');
    }

    private async getTaskInfo(taskRef: any): Promise<any> {
        await this.ensureClientReady();
        const serviceContent = this.vsphereClient.serviceContent;
        const result: any = await this.runVsphereCommand('RetrievePropertiesEx', {
            _this: serviceContent.propertyCollector,
            specSet: [
                {
                    propSet: [
                        { type: 'Task', all: false, pathSet: ['info.state', 'info.error'] },
                    ],
                    objectSet: [{ obj: taskRef, skip: false }],
                },
            ],
            options: {},
        });

        const props = result?.returnval?.objects?.[0]?.propSet ?? [];
        return {
            state: props.find((prop: any) => prop.name === 'info.state')?.val,
            error: props.find((prop: any) => prop.name === 'info.error')?.val,
        };
    }

    /**
     * Trouve un objet (VM, Host, etc.) par son nom exact
     */
    private async resolveVmTarget(vmReference?: string | null, vmName?: string): Promise<{ id: string; name: string; state: string; ipAddress?: string; ref: any } | null> {
        const vms = await this.getVms();
        const normalizedReference = vmReference?.trim();
        const normalizedName = vmName?.trim().toLowerCase();

        const foundVm = vms.find((vm: any) => {
            const id = String(vm?.id ?? '');
            const name = String(vm?.name ?? '');
            return (
                (normalizedReference && (id === normalizedReference || name.toLowerCase() === normalizedReference.toLowerCase())) ||
                (normalizedName && name.toLowerCase() === normalizedName)
            );
        });

        if (!foundVm) {
            return null;
        }

        const id = String(foundVm.id);

        return {
            id,
            name: foundVm.name,
            state: foundVm.state,
            ipAddress: foundVm.ipAddress,
            ref: {
                attributes: { 'xsi:type': 'ManagedObjectReference', type: 'VirtualMachine' },
                $value: id,
            },
        };
    }

    private async findMoRefByName(type: string, name: string): Promise<any> {
        try {
            const vmsResponse: any = await this.getVms();

            this.logger.debug(`VMS Response reçue : ${JSON.stringify(vmsResponse)}`);

            // Puisque vmsResponse est DIRECTEMENT le tableau :
            if (!Array.isArray(vmsResponse)) {
                this.logger.error("❌ La réponse n'est pas un tableau.");
                return null;
            }

            const foundVm = vmsResponse.find(
                (vm: any) => vm && vm.name && vm.name.toLowerCase() === name.toLowerCase()
            );

            if (foundVm) {
                this.logger.log(`✅ Template trouvé ! Nom: ${foundVm.name}, ID VMware: ${foundVm.id}`);
                return {
                    attributes: { 'xsi:type': 'ManagedObjectReference', type: 'VirtualMachine' },
                    $value: foundVm.id // C'est ici qu'on injecte le "3"
                };
            }

            this.logger.warn(`⚠️ Aucune VM trouvée avec le nom : ${name}`);
            return null;

        } catch (error) {
            this.logger.error(`❌ Erreur dans findMoRefByName : ${error.message}`);
            return null;
        }
    }
    /**
     * Récupère le premier objet d'un type donné (utile pour le Datastore ou Pool par défaut)
     */
    private async getFirstMoRef(type: 'Datastore' | 'ResourcePool' | 'Datacenter' | 'HostSystem'): Promise<any> {
        await this.ensureClientReady();
        const serviceContent = this.vsphereClient.serviceContent;

        // Utilisation simplifiée pour ton lab (récupère le premier trouvé)
        const containerView: any = await new Promise((resolve, reject) => {
            this.vsphereClient.client.CreateContainerView({
                _this: serviceContent.viewManager,
                container: serviceContent.rootFolder,
                type: [type],
                recursive: true
            }, (err, res) => err ? reject(err) : resolve(res.returnval));
        });

        const result: any = await new Promise((resolve, reject) => {
            this.vsphereClient.client.RetrievePropertiesEx({
                _this: serviceContent.propertyCollector,
                specSet: [{
                    propSet: [{ type: type, all: false, pathSet: ['name'] }],
                    objectSet: [{
                        obj: containerView, skip: true, selectSet: [{
                            attributes: { 'xsi:type': 'TraversalSpec' },
                            name: 'viewTraversalSpec', type: 'ContainerView', path: 'view', skip: false
                        }]
                    }]
                }],
                options: {}
            }, (err, res) => err ? reject(err) : resolve(res));
        });

        return result?.returnval?.objects[0]?.obj || null;
    }

    async obtenirTicketConsole(vmIdware: string) {
        try {
            // 1. Préparation des paramètres pour l'appel SOAP vSphere 8.0
            const argumentsSoap = {
                _this: {
                    attributes: { type: 'VirtualMachine' },
                    $value: vmIdware, // Ex: "1" ou "vm-42" (l'ID VMware de ton Alpine)
                },
                ticketType: 'webmks', // On demande explicitement le format HTML5 WebMKS
            };

            // 2. Appel de la méthode native vSphere "AcquireTicket"
            // Note : 'this.soapClient' représente ton client connecté à l'ESXi
            const [resultat] = await this.vsphereClient.client.AcquireTicketAsync(argumentsSoap);

            // 3. Extraction des données renvoyées par l'ESXi
            // vSphere renvoie un objet contenant le ticket, le host, et le port
            return {
                ticket: resultat.returnval.ticket,     // Le token de sécurité unique
                cfgFile: resultat.returnval.cfgFile,   // Le chemin du fichier .vmx
                host: this.host,                 // L'IP de ton ESXi (visible sur ta capture)
                port: 443,                             // Le port standard sécurisé
            };

        } catch (erreur) {
            throw new BadRequestException(
                `Impossible de générer le ticket MKS : ${erreur.message}`,
            );
        }
    }

}
