import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { MachineVirtuelle } from 'src/entities/machineVirtuelle.entity';
import { ServiceStatus } from 'src/enum/service-status.enum';
import { WalletService } from './wallet.service';
import { EsxiService } from 'src/esxi/esxi.service';

@Injectable()
export class BillingScheduler {
  private readonly logger = new Logger(BillingScheduler.name);

  constructor(
    @InjectRepository(MachineVirtuelle)
    private readonly vmRepo: Repository<MachineVirtuelle>,
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => EsxiService))
    private readonly esxiService: EsxiService,
  ) { }

  /**
   * Facturation quotidienne : tous les jours à 00:00
   * Vérifie les VMs dont la date de prochaine facturation est arrivée (<= maintenant)
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async facturationMensuelle() {
    this.logger.log('🕛 Démarrage de la vérification quotidienne de facturation...');
    const now = new Date();

    const vmsActives = await this.vmRepo.find({
      where: {
        dateProchaineFacturation: LessThanOrEqual(now),
      },
      relations: ['client', 'catalogue'],
    });

    if (vmsActives.length === 0) {
      this.logger.log('✅ Aucune VM ne nécessite de facturation aujourd\'hui.');
      return;
    }

    let success = 0;
    let errors = 0;

    for (const vm of vmsActives) {
      try {
        if (!vm.client) {
          this.logger.warn(`VM #${vm.id} sans client — ignorée`);
          continue;
        }

        const prix = Number(vm.prixMensuel || 0);
        if (prix <= 0) continue;

        const clientId = vm.client.id;
        const soldeOk = await this.walletService.checkSolde(clientId, prix);

        if (!soldeOk) {
          this.logger.warn(
            `⚠️ Solde insuffisant pour client #${clientId} — VM "${vm.nomPersonnalise}" (${prix} DT requis). Accès bloqué.`,
          );
          // On change le statut en attente de paiement
          await this.vmRepo.update(vm.id, { status: ServiceStatus.AWAITING_PAYMENT });
          
          // Et on force l'extinction sur l'ESXi pour bloquer l'accès réel
          try {
            await this.esxiService.powerControl(vm.vmReference || vm.nomPersonnalise, 'stop');
          } catch (e) {
            this.logger.error(`Impossible d'éteindre la VM #${vm.id} suite au non-paiement: ${e.message}`);
          }
          
          continue; // On passe à la VM suivante sans débiter
        }

        await this.walletService.debiter(
          clientId,
          prix,
          `Renouvellement mensuel VM: ${vm.nomPersonnalise} (${vm.catalogue?.nomService || 'Offre catalogue'})`,
          vm.id,
        );

        // Mettre à jour la date de prochaine facturation (+1 mois)
        const nextMonth = new Date(vm.dateProchaineFacturation || now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        await this.vmRepo.update(vm.id, { dateProchaineFacturation: nextMonth });

        this.logger.log(`✅ Facturation renouvelée pour VM #${vm.id}. Prochaine facturation: ${nextMonth.toISOString()}`);
        success++;
      } catch (err) {
        this.logger.error(`❌ Erreur facturation VM #${vm.id}: ${err.message}`);
        errors++;
      }
    }

    this.logger.log(
      `✅ Facturation quotidienne terminée — ${success} VMs facturées, ${errors} erreurs`,
    );
  }
}
