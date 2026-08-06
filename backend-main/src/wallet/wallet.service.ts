import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from 'src/entities/wallet.entity';
import { Transaction } from 'src/entities/transaction.entity';
import { Client } from 'src/entities/client.entity';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
  ) {}

  /**
   * Trouve ou crée le wallet d'un client avec solde = 0
   */
  async getOrCreateWallet(clientId: number): Promise<Wallet> {
    // Chercher le wallet existant via la relation client
    let wallet = await this.walletRepo.findOne({
      where: { user: { id: clientId } },
      relations: ['user'],
    });

    if (!wallet) {
      const client = await this.clientRepo.findOne({ where: { id: clientId } });
      if (!client) {
        throw new NotFoundException(`Client #${clientId} introuvable`);
      }

      wallet = this.walletRepo.create({
        solde: 0,
        devise: 'DT',
        user: client,
      });
      wallet = await this.walletRepo.save(wallet);
      this.logger.log(`✅ Wallet créé pour le client #${clientId} (solde: 0 DT)`);
    }

    return wallet;
  }

  /**
   * Retourne le wallet avec ses transactions (du plus récent au plus ancien)
   */
  async getWalletByClient(clientId: number): Promise<{ wallet: Wallet; transactions: Transaction[] }> {
    const wallet = await this.getOrCreateWallet(clientId);

    const transactions = await this.transactionRepo.find({
      where: { wallet: { id: wallet.id } },
      order: { dateTransaction: 'DESC' },
      take: 50,
    });

    return { wallet, transactions };
  }

  /**
   * Recharge le wallet de +30 DT (montant fixe, statique)
   */
  async recharger(clientId: number): Promise<Wallet> {
    const MONTANT_RECHARGE = 30;
    const wallet = await this.getOrCreateWallet(clientId);

    wallet.solde = Number(wallet.solde) + MONTANT_RECHARGE;
    await this.walletRepo.save(wallet);

    // Enregistrer la transaction
    const transaction = this.transactionRepo.create({
      montant: MONTANT_RECHARGE,
      type: 'CREDIT',
      description: `Rechargement du wallet (+${MONTANT_RECHARGE} DT)`,
      wallet,
    });
    await this.transactionRepo.save(transaction);

    this.logger.log(`💳 Recharge +${MONTANT_RECHARGE} DT pour client #${clientId}. Nouveau solde: ${wallet.solde} DT`);
    return wallet;
  }

  /**
   * Débite le wallet du client. Lève une BadRequestException si solde insuffisant.
   */
  async debiter(
    clientId: number,
    montant: number,
    description: string,
    vmId?: number,
  ): Promise<Wallet> {
    if (montant <= 0) return this.getOrCreateWallet(clientId);

    const wallet = await this.getOrCreateWallet(clientId);
    const soldeActuel = Number(wallet.solde);

    if (soldeActuel < montant) {
      throw new BadRequestException(
        `Solde insuffisant. Solde actuel: ${soldeActuel.toFixed(3)} DT, montant requis: ${montant.toFixed(3)} DT`,
      );
    }

    wallet.solde = soldeActuel - montant;
    await this.walletRepo.save(wallet);

    const transaction = this.transactionRepo.create({
      montant,
      type: 'DEBIT',
      description,
      vmId: vmId ?? undefined,
      wallet,
    });
    await this.transactionRepo.save(transaction);

    this.logger.log(`💸 Débit -${montant} DT pour client #${clientId}. Nouveau solde: ${wallet.solde} DT`);
    return wallet;
  }

  /**
   * Crédite le wallet (remboursement)
   */
  async crediter(
    clientId: number,
    montant: number,
    description: string,
    vmId?: number,
  ): Promise<Wallet> {
    if (montant <= 0) return this.getOrCreateWallet(clientId);

    const wallet = await this.getOrCreateWallet(clientId);
    wallet.solde = Number(wallet.solde) + montant;
    await this.walletRepo.save(wallet);

    const transaction = this.transactionRepo.create({
      montant,
      type: 'CREDIT',
      description,
      vmId: vmId ?? undefined,
      wallet,
    });
    await this.transactionRepo.save(transaction);

    this.logger.log(`💳 Crédit +${montant} DT pour client #${clientId}. Nouveau solde: ${wallet.solde} DT`);
    return wallet;
  }

  /**
   * Vérifie si le client a assez de solde (sans débiter)
   */
  async checkSolde(clientId: number, montant: number): Promise<boolean> {
    if (montant <= 0) return true;
    const wallet = await this.getOrCreateWallet(clientId);
    return Number(wallet.solde) >= montant;
  }

  /**
   * Crée un wallet vierge (solde = 0) pour un client tout juste créé
   * Utilisé lors de l'inscription
   */
  async createWalletForClient(client: Client): Promise<Wallet> {
    // Vérifier qu'il n'en a pas déjà un
    const existing = await this.walletRepo.findOne({
      where: { user: { id: client.id } },
    });
    if (existing) return existing;

    const wallet = this.walletRepo.create({
      solde: 0,
      devise: 'DT',
      user: client,
    });
    const saved = await this.walletRepo.save(wallet);
    this.logger.log(`✅ Wallet initialisé à 0 DT pour client #${client.id}`);
    return saved;
  }
}
