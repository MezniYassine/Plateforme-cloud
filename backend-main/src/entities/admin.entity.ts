import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Admin {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nom!: string;

    @Column()
    prenom!: string;

    @Column({ unique: true })
    email!: string;

    @Column()
    password!: string;

    @Column({ type: 'simple-array', nullable: true })
    providers?: string[];

    @Column({ type: 'simple-array', nullable: true })
    providerIds?: string[];

    // OTP pour la vérification MFA par email
    @Column({ type: 'varchar', nullable: true })
    otpCode!: string | null;

    @Column({ type: 'timestamp', nullable: true })
    otpExpiry!: Date | null;
}