import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * GET /wallet/me
   * Retourne le solde et l'historique des 50 dernières transactions du client connecté
   */
  @Get('me')
  async getMyWallet(@Req() req: any) {
    const clientId = Number(req.user.sub);
    const { wallet, transactions } = await this.walletService.getWalletByClient(clientId);
    return {
      solde: Number(wallet.solde),
      devise: wallet.devise,
      transactions,
    };
  }

  /**
   * POST /wallet/recharger
   * Recharge le wallet de +30 DT (statique, avant intégration paiement en ligne)
   */
  @Post('recharger')
  async recharger(@Req() req: any) {
    const clientId = Number(req.user.sub);
    const wallet = await this.walletService.recharger(clientId);
    return {
      message: 'Wallet rechargé avec succès (+30 DT)',
      nouveauSolde: Number(wallet.solde),
      devise: wallet.devise,
    };
  }
}
