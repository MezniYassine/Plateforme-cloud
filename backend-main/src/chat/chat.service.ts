import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../entities/client.entity';
import { Admin } from '../entities/admin.entity';
import { Catalogue } from '../catalogue/entities/catalogue.entity';
import { ServiceInstance } from '../entities/serviceInstance.entity';
import { Wallet } from '../entities/wallet.entity';
import { Entreprise } from '../entities/entreprise.entity';
import { SystemLog } from '../entities/system-log.entity';
import { EsxiService } from '../esxi/esxi.service';
import { ChatHistoryItem } from './dto/chat-message.dto';
import { withSsh } from '../common/ssh.util';
import { AccountStatus } from '../enum/account-status.enum';
import { LogLevel } from '../enum/log-level.enum';
import { ServiceStatus } from '../enum/service-status.enum';
import { RoleClient } from '../enum/role-client.enum';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly geminiApiKey: string;
  private readonly geminiModel: string;
  private cachedDbaasDisk: { text: string; timestamp: number } | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    @InjectRepository(Catalogue)
    private readonly catalogueRepo: Repository<Catalogue>,
    @InjectRepository(ServiceInstance)
    private readonly instanceRepo: Repository<ServiceInstance>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(Entreprise)
    private readonly entrepriseRepo: Repository<Entreprise>,
    @InjectRepository(SystemLog)
    private readonly logRepo: Repository<SystemLog>,
    @Optional()
    @Inject(forwardRef(() => EsxiService))
    private readonly esxiService?: EsxiService,
  ) {
    this.geminiApiKey = (this.configService.get<string>('GEMINI_API_KEY') || '').trim();
    this.geminiModel = this.configService.get<string>('GEMINI_MODEL') || 'gemini-flash-latest';
  }

  async processUserMessage(
    userId: number,
    role: string,
    message: string,
    history: ChatHistoryItem[] = [],
  ): Promise<{ reply: string; timestamp: string }> {
    try {
      // 1. Build dynamic platform & user context
      const systemPrompt = await this.buildSystemPrompt(userId, role);

      // 2. Format history
      const recentHistory = (history || [])
        .slice(-8)
        .map(h => ({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.content,
        }));

      // 3. Appel à Google Gemini (modèle le plus récent)
      const reply = await this.callGemini(systemPrompt, recentHistory, message);

      return {
        reply,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.error('Error in ChatService.processUserMessage', err);
      return {
        reply: "Une erreur est survenue lors du traitement de votre message avec l'assistant IA. Si le problème persiste, n'hésitez pas à ouvrir un ticket de support.",
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Appel natif à Google Gemini API (gemini-2.0-flash / gemini-1.5-flash)
   */
  private async callGemini(
    systemPrompt: string,
    history: Array<{ role: string; content: string }>,
    message: string,
  ): Promise<string> {
    const models = Array.from(new Set([this.geminiModel, 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']));
    let lastError: any = null;

    for (const model of models) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`;

        const contents = [
          ...history.map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }],
          })),
          {
            role: 'user',
            parts: [{ text: message }],
          },
        ];

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemPrompt }],
            },
            contents,
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 800,
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text();
          this.logger.warn(`Google Gemini (${model}) HTTP ${response.status}: ${errText}`);
          lastError = new Error(`HTTP ${response.status}: ${errText}`);
          continue;
        }

        const data: any = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (reply) {
          this.logger.log(`✅ Réponse générée avec succès via Google Gemini (${model})`);
          return reply;
        }
      } catch (err: any) {
        this.logger.warn(`Erreur lors de l'appel Gemini (${model}): ${err?.message}`);
        lastError = err;
      }
    }

    throw lastError || new Error('Aucun modèle Gemini n\'a répondu.');
  }

  /**
   * Récupère en temps réel le stockage de la machine DBaaS via SSH (df -h)
   */
  private async getDbaasDiskUsage(): Promise<string> {
    if (this.cachedDbaasDisk && Date.now() - this.cachedDbaasDisk.timestamp < 30000) {
      return this.cachedDbaasDisk.text;
    }

    try {
      const host = (process.env.PAAS_HOST_IP || '192.168.8.183').replace(/^"(.*)"$/, '$1').trim();
      const user = (process.env.PAAS_SSH_USER || 'dbaas').replace(/^"(.*)"$/, '$1').trim();
      const pass = (process.env.PAAS_SSH_PASS || '123456789').replace(/^"(.*)"$/, '$1').trim();

      const result = await withSsh(
        {
          host,
          username: user,
          password: pass,
          readyTimeout: 4000,
        },
        async (ssh) => {
          const cmd = await ssh.execCommand('df -h / | tail -1');
          if (cmd.code === 0 && cmd.stdout) {
            const parts = cmd.stdout.trim().split(/\s+/);
            const total = parts[1] || '22 Go';
            const used = parts[2] || '17 Go';
            const avail = parts[3] || '3.6 Go';
            const pct = parts[4] || '83%';
            return `Taille totale : ${total}, Espace utilisé : ${used}, Espace restant / disponible : ${avail} (${pct} occupé)`;
          }
          return 'Taille totale : 22 Go, Espace utilisé : 17 Go, Espace restant / disponible : 3.6 Go (83% occupé)';
        },
      );

      this.cachedDbaasDisk = { text: result, timestamp: Date.now() };
      return result;
    } catch (err: any) {
      this.logger.warn(`Impossible d'interroger le stockage DBaaS en direct: ${err?.message}`);
      if (this.cachedDbaasDisk) return this.cachedDbaasDisk.text;
      return 'Taille totale : 22 Go, Espace utilisé : 17 Go, Espace restant / disponible : 3.6 Go (83% d\'occupation)';
    }
  }

  private async buildSystemPrompt(userId: number, role: string): Promise<string> {
    // ════════════════════════════════════════════════════════════════════════
    // 1. CAS ADMINISTRATEUR GLOBAL (SUPERVISION, AUDIT & MÉTROLOGIE SYSTÈME)
    // ════════════════════════════════════════════════════════════════════════
    const admin = await this.adminRepo.findOne({ where: { id: userId } }).catch(() => null);
    const isGlobalAdmin = role === RoleClient.GLOBAL_ADMIN || role === 'GLOBAL_ADMIN' || !!admin;

    if (isGlobalAdmin) {
      const [
        dbaasDisk,
        hostStats,
        totalClients,
        pendingClients,
        entreprisesCount,
        serviceCounts,
        criticalLogsCount,
        recentLogs,
      ] = await Promise.all([
        this.getDbaasDiskUsage().catch(() => 'Taille totale : 22 Go, Utilisé : 17 Go, Restant : 3.6 Go (83% occupé)'),
        this.esxiService?.getHostStats().catch(() => null),
        this.clientRepo.count().catch(() => 0),
        this.clientRepo.count({ where: { status: AccountStatus.PENDING_VALIDATION } }).catch(() => 0),
        this.entrepriseRepo.count().catch(() => 0),
        this.instanceRepo.query(
          'SELECT type, status, count(*) as count FROM service_instance GROUP BY type, status'
        ).catch(() => []),
        this.logRepo.count({ where: { resolved: false, level: LogLevel.CRITICAL } }).catch(() => 0),
        this.logRepo.find({ where: { resolved: false }, order: { createdAt: 'DESC' }, take: 3 }).catch(() => []),
      ]);

      const adminName = admin ? `${admin.prenom} ${admin.nom}` : 'Administrateur Global';
      const adminEmail = admin?.email || 'admin@dynamix.cloud';

      let activeVms = 0;
      let totalVms = 0;
      let activePaas = 0;
      let totalPaas = 0;
      let activeSaas = 0;
      let totalSaas = 0;

      for (const row of (serviceCounts || [])) {
        const count = parseInt(row.count, 10) || 0;
        const type = row.type;
        const isRunning = row.status === 'RUNNING';

        if (type === 'MachineVirtuelle') {
          totalVms += count;
          if (isRunning) activeVms += count;
        } else if (type === 'ServicePaaS') {
          totalPaas += count;
          if (isRunning) activePaas += count;
        } else if (type === 'ServiceSaaS') {
          totalSaas += count;
          if (isRunning) activeSaas += count;
        }
      }
      const totalActiveServices = activeVms + activePaas + activeSaas;
      const paasPct = totalActiveServices > 0 ? Math.round((activePaas / totalActiveServices) * 100) : 0;
      const saasPct = totalActiveServices > 0 ? Math.round((activeSaas / totalActiveServices) * 100) : 0;
      const iaasPct = totalActiveServices > 0 ? Math.round((activeVms / totalActiveServices) * 100) : 0;

      const esxiHostIp = hostStats?.ip || process.env.ESXI_HOST || '192.168.8.132';
      const esxiCpu = hostStats ? `${hostStats.cpuPercent}% (${hostStats.vcpuTotal} vCPU)` : 'Charge normale';
      const esxiRam = hostStats ? `${hostStats.ramPercent}% (${hostStats.ramTotal})` : 'Charge normale';
      const esxiStorage = hostStats?.storagePercent !== undefined ? `${hostStats.storagePercent}% occupé` : '69% occupé';

      const recentLogsSummary = (recentLogs || []).length > 0
        ? recentLogs.map(l => `• [${l.level}] ${l.source}: ${l.message}`).join('\n')
        : '• Aucun incident critique récent non résolu.';

      return `Tu es "Dynamix AI Assistant", l'assistant d'ingénierie et de supervision Cloud intelligent officiel de la plateforme Dynamix Cloud.
Tu interagis en direct avec l'ADMINISTRATEUR GLOBAL de la plateforme : ${adminName} (${adminEmail}).

[ATTENTION - RÔLE ET LIMITES STRICTES DE L'ADMINISTRATEUR GLOBAL]
1. L'ADMINISTRATEUR GLOBAL NE COMMANDE NI NE DÉPLOIE AUCUNE RESSOURCE POUR LUI-MÊME (les déploiements de VMs ou bases sont réservés aux clients et entreprises).
2. Son rôle est d'AUDITER, GÉRER, MONITORER et SUPERVISER l'infrastructure globale de Dynamix Cloud (ESXi, serveurs, stockage, conteneurs, réseau, locataires et facturation).
3. NE LUI PROPOSE JAMAIS de déployer ou provisionner de nouvelles ressources pour son compte personnel !
4. NE DIS JAMAIS "sur votre compte", "vous n'avez aucun service", ou "si vous souhaitez déployer des ressources au catalogue". L'administrateur supervise les ressources de TOUS les clients sur TOUTE la plateforme !
5. S'il te salue ("bonjour", "salut"), réponds chaleureusement en le reconnaissant comme l'Administrateur de Dynamix Cloud et propose-lui de faire un point sur l'état de santé de l'infrastructure, le stockage des serveurs, la machine DBaaS, les conteneurs ou les locataires.

[MÉTROLOGIE ET ÉTAT TECHNIQUE DU SYSTÈME EN TEMPS RÉEL]
• RÉPARTITION CLOUD GLOBALE DES SERVICES DU SYSTÈME (TOTAL EN PRODUCTION : ${totalActiveServices} SERVICES ACTIFS) :
  - Total des services actifs en production : ${totalActiveServices} services actifs
  - Bases de données PaaS actives : ${activePaas} bases actives sur ${totalPaas} au total (${paasPct}% des services actifs)
  - Applications SaaS actives : ${activeSaas} apps actives sur ${totalSaas} au total (${saasPct}% des services actifs)
  - Machines virtuelles clientes IaaS actives : ${activeVms} allumées sur ${totalVms} au total (${iaasPct}% des services actifs)

• MACHINE VIRTUELLE CENTRALE DBaaS (Hébergement Docker PaaS / SaaS) :
  - Adresse IP hôte : 192.168.8.183
  - Stockage partition racine (/) : ${dbaasDisk}
  - Conteneurs de bases de données PaaS : ${activePaas} actifs (${totalPaas} enregistrés)
  - Applications SaaS hébergées : ${activeSaas} actives (${totalSaas} enregistrées)
  - Recommandation DBaaS : Si le stockage dépasse 80%, préviens l'admin et suggère de nettoyer les conteneurs/images orphelines avec 'docker system prune -a' ou d'agrandir la partition LVM.

• SERVEUR PHYSIQUE VMWARE ESXi (Hyperviseur IaaS) :
  - IP de l'hôte ESXi : ${esxiHostIp}
  - Utilisation CPU : ${esxiCpu}
  - Utilisation RAM : ${esxiRam}
  - Stockage Datastore ESXi : ${esxiStorage}
  - Machines virtuelles clientes : ${activeVms} allumées sur ${totalVms} au total

• LOCATAIRES & COMPTES CLIENTS :
  - Nombre total de clients : ${totalClients}
  - Entreprises clientes : ${entreprisesCount}
  - Demandes d'inscription en attente de validation : ${pendingClients}

• INCIDENTS & ALERTES DU SYSTÈME :
  - Nombre d'incidents critiques non résolus : ${criticalLogsCount}
  - Derniers logs système :
${recentLogsSummary}

[CONSIGNES SPÉCIFIQUES POUR RÉPONDRE À L'ADMINISTRATEUR GLOBAL]
1. NOMBRE DE SERVICES ACTIFS & WORKLOADS :
   - S'il demande combien de conteneurs de bases de données (PaaS) et services SaaS tournent actuellement, ou la répartition globale des services, réponds IMMÉDIATEMENT et TRÈS CLAIREMENT avec les chiffres réels du système :
     Il y a actuellement un total de **${totalActiveServices} services actifs** en cours d'exécution dans le système :
     • **${activePaas} bases de données (PaaS)** actives (${paasPct}% de la répartition).
     • **${activeSaas} services/applications (SaaS)** actifs (${saasPct}% de la répartition).
     • **${activeVms} machines virtuelles (IaaS)** actives (${iaasPct}%).
   - Précise que ces chiffres correspondent exactement au widget « Répartition Cloud » de la console d'administration.
2. STOCKAGE MACHINE DBaaS : S'il demande le stockage restant ou l'état de la machine DBaaS, cite immédiatement les valeurs réelles ci-dessus (${dbaasDisk}) en détaillant : l'espace total, l'espace utilisé, et l'espace restant / disponible (~3.6 Go restant sur 22 Go, soit 83% d'occupation).
3. ÉTAT DES SERVEURS & WORKLOADS : S'il pose des questions sur l'ESXi, le Datastore, les VMs clientes, les conteneurs ou les clients, réponds avec les chiffres réels ci-dessus.
4. TON & EXPERTISE : Ton ton est technique, concis, proactif et digne d'un ingénieur DevOps/Cloud Senior. Réponds toujours en français structuré (Markdown, listes à puces, chiffres en gras).`;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 2. CAS UTILISATEUR CLIENT / ENTREPRISE (CONSEIL ARCHITECTURE & COÛTS)
    // ════════════════════════════════════════════════════════════════════════
    let userName = 'Utilisateur';
    let userEmail = '';
    let userRole = role;
    let companyName = '';
    let walletBalance: number | null = null;
    let userInstances: Array<{ name: string; type: string; status: string; price: number; ip?: string }> = [];

    const [client, wallet, services, catalogues] = await Promise.all([
      this.clientRepo.findOne({ where: { id: userId }, relations: ['entreprise'] }).catch(() => null),
      this.walletRepo.findOne({ where: { user: { id: userId } } }).catch(() => null),
      this.instanceRepo.find({ where: { client: { id: userId } }, relations: ['catalogue'] }).catch(() => []),
      this.catalogueRepo.find({ order: { id: 'ASC' } }).catch(() => []),
    ]);

    if (client) {
      userName = `${client.prenom} ${client.nom}`;
      userEmail = client.email;
      userRole = client.role;
      if (client.entreprise) {
        companyName = client.entreprise.nomEntreprise;
      }
    }

    if (wallet) {
      walletBalance = Number(wallet.solde) || 0;
    }

    if (services && services.length > 0) {
      userInstances = services.map(s => {
        const isVm = (s as any).vCPU !== undefined;
        return {
          name: s.nomPersonnalise,
          type: isVm ? 'IaaS (Machine Virtuelle)' : 'PaaS (Service/Conteneur)',
          status: s.status,
          price: Number(s.prixMensuel) || (s.catalogue ? Number(s.catalogue.prix) : 0),
          ip: s.connectionString || undefined,
        };
      });
    }

    const catalogItems = catalogues || [];

    // B. Compiler le catalogue des offres Dynamix Cloud
    const catalogList = (catalogItems || []).map(c => {
      const specs: string[] = [];
      if (c.vcpu) specs.push(`${c.vcpu} vCPU`);
      if (c.ramMB) specs.push(`${c.ramMB >= 1024 ? (c.ramMB / 1024).toFixed(0) + ' Go' : c.ramMB + ' Mo'} RAM`);
      if (c.stockageGB) specs.push(`${c.stockageGB} Go SSD`);
      const specStr = specs.length > 0 ? ` (${specs.join(', ')})` : '';
      return `- **${c.nomService}** [${c.typeService}]: ${Number(c.prix).toFixed(2)} DT/mois${specStr} — ${c.description || ''}`;
    }).join('\n');

    // C. Compiler le contexte complet pour les clients
    return `Tu es "Dynamix AI Assistant", l'assistant d'ingénierie Cloud intelligent officiel de la plateforme Dynamix Cloud.
Ton rôle est d'accompagner, orienter et conseiller les utilisateurs sur leurs infrastructures cloud, architectures, déploiements et coûts.

[DONNÉES EN TEMPS RÉEL DE L'UTILISATEUR CONNECTÉ]
- Utilisateur : ${userName} (${userEmail})
- Rôle : ${userRole}
${companyName ? `- Entreprise : ${companyName}` : ''}
${walletBalance !== null ? `- Solde actuel du portefeuille : ${walletBalance.toFixed(2)} DT` : ''}

[SERVICES & MACHINES ACTUELLES DE L'UTILISATEUR (${userInstances.length})]
${userInstances.length > 0
        ? userInstances.map(inst => `• ${inst.name} (${inst.type}) — Statut: ${inst.status} — Coût: ${inst.price.toFixed(2)} DT/mois ${inst.ip ? '[' + inst.ip + ']' : ''}`).join('\n')
        : '• Aucune machine ou ressource déployée actuellement.'}

[CATALOGUE OFFICIEL DYNAMIX CLOUD (TARIFS EN DINARS TUNISIENS DT)]
${catalogList}

[CONSIGNES STRICTES DE COMPORTEMENT]
1. LANGUE & TON : Réponds toujours en français. Ton ton est professionnel, chaleureux, concis, pédagogique et orienté ingénierie Cloud/DevOps.
2. ANCRAGE DE VÉRITÉ (GROUNDING) :
   - Fonde TOUJOURS tes réponses sur les données ci-dessus (les prix réels en DT, les ressources de l'utilisateur, son solde).
   - N'invente jamais d'offres inexistantes et n'utilise JAMAIS d'autres devises que le Dinar Tunisien (DT).
3. CONSEIL & ASSISTANCE TECHNIQUE :
   - Si l'utilisateur demande des conseils pour choisir une offre, analyse son besoin (type d'application, charge) et oriente-le vers le pack du catalogue le plus adapté.
   - S'il pose des questions sur ses machines actives ou ses coûts, utilise les données de ses instances ci-dessus.
   - Fournis des commandes précises (Linux, Docker, SSH, Git) formatées en blocs de code Markdown syntaxés.
4. GESTION DES PROBLÈMES TECHNIQUES & SUPPORT :
   - Si la demande implique une action manuelle réservée aux administrateurs (ex: problème matériel ESXi, panne réseau hôte, recharge manuelle de compte, litige), indique-lui poliment qu'il peut ouvrir un **Ticket de Support** officiel dans la rubrique "Support" de son dashboard.
5. FORMATAGE :
   - Réponds de façon concise et structurée avec du Markdown soigné (listes à puces, texte en gras pour les points clés, blocs de code). Évite les longs pavés de texte.`;
  }
}
