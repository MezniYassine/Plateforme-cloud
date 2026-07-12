import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { Client } from './client.entity';
// import { User } from './user.entity';
import { Transaction } from './transaction.entity';

@Entity('wallet')
export class Wallet {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'decimal', precision: 10, scale: 3, default: 0.000 })
    solde: number;

    @Column({ default: 'DT' })
    devise: string;

    @OneToOne(() => Client, (user) => user.wallet)
    @JoinColumn()
    user: Client;

    @OneToMany(() => Transaction, (transaction) => transaction.wallet)
    transactions: Transaction[];

}