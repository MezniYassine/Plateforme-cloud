import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Wallet } from './wallet.entity';
// import { Wallet } from './wallet.entity';

@Entity('transaction')
export class Transaction {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'decimal', precision: 10, scale: 3 })
    montant: number;

    @Column()
    type: 'DEBIT' | 'CREDIT';

    @Column()
    description: string;

    @CreateDateColumn()
    dateTransaction: Date;


    @Column({ nullable: true })
    reference?: string;

    @Column({ nullable: true })
    vmId: number;

    @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
    wallet: Wallet;
}