import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Personal } from 'src/entities/personal.entity';
import { Demande, DemandeStatus } from 'src/demande/entities/demande.entity';
import { Wallet } from 'src/entities/wallet.entity';
import { Transaction } from 'src/entities/transaction.entity';
import { computePrediction } from 'src/common/prediction.util';

@Injectable()
export class PersonnelService {
    constructor(
        @InjectRepository(Personal)
        private readonly personalRepository: Repository<Personal>,
        @InjectRepository(Demande)
        private readonly demandeRepository: Repository<Demande>,
        @InjectRepository(Wallet)
        private readonly walletRepo: Repository<Wallet>,
        @InjectRepository(Transaction)
        private readonly transactionRepo: Repository<Transaction>,
    ) { }


    async getProfile(personalId: number) {
        return this.personalRepository.findOne({ where: { id: personalId }, relations: ['client'] });
    }

    async getBilling(clientId: number) {
        const wallet = await this.walletRepo.findOne({
            where: { user: { id: clientId } }
        });

        if (!wallet) return [];

        const transactions = await this.transactionRepo.find({
            where: { wallet: { id: wallet.id } },
            order: { dateTransaction: 'DESC' }
        });

        const invoices: any[] = [];
        for (const t of transactions) {
            const price = Number(t.montant);
            const dDate = new Date(t.dateTransaction);
            const period = dDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
            const isDebit = t.type === 'DEBIT';

            // Ensure reference is persisted in database
            if (!t.reference) {
                t.reference = `FAC-${dDate.getFullYear()}-${String(t.id).padStart(5, '0')}`;
                await this.transactionRepo.save(t);
            }

            invoices.push({
                id: t.id,
                period,
                ref: t.reference,
                resources: t.description || (isDebit ? 'Provisionnement de ressources' : 'Recharge Wallet'),
                amount: `${isDebit ? '-' : '+'}${price.toFixed(2)} DT`,
                status: isDebit ? 'Payée' : 'Recharge',
                statusClass: isDebit ? 'running' : 'provisioning'
            });
        }

        return invoices;
    }

    // ─── PREDICTION IA ──────────────────────────────────────────────────────
    async getPersonnelPrediction(clientId: number) {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear  = now.getFullYear();

        const revenusMensuels = new Array(12).fill(0);

        const wallet = await this.walletRepo.findOne({
            where: { user: { id: clientId } },
        });

        if (!wallet) {
            return computePrediction(revenusMensuels, currentMonth);
        }

        const transactions = await this.transactionRepo.find({
            where: { wallet: { id: wallet.id }, type: 'DEBIT' },
            order: { dateTransaction: 'ASC' },
        });

        for (const t of transactions) {
            const d = new Date(t.dateTransaction);
            if (d.getFullYear() === currentYear) {
                revenusMensuels[d.getMonth()] += Number(t.montant) || 0;
            }
        }

        return computePrediction(revenusMensuels, currentMonth);
    }
}