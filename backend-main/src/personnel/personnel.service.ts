import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Personal } from 'src/entities/personal.entity';
import { Demande, DemandeStatus } from 'src/demande/entities/demande.entity';
import { Wallet } from 'src/entities/wallet.entity';
import { Transaction } from 'src/entities/transaction.entity';

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

        const invoices = transactions.map(t => {
            const price = Number(t.montant);
            const dDate = new Date(t.dateTransaction);
            const period = dDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
            const isDebit = t.type === 'DEBIT';
            const ref = `TRX-${String(t.id).padStart(5, '0')}`;
            return {
                period,
                ref,
                resources: t.description || (isDebit ? 'Provisionnement de ressources' : 'Recharge Wallet'),
                amount: `${isDebit ? '-' : '+'}${price.toFixed(2)} DT`,
                status: isDebit ? 'Payée' : 'Recharge',
                statusClass: isDebit ? 'running' : 'provisioning'
            };
        });

        return invoices;
    }
}