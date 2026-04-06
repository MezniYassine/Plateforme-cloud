import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from "typeorm";
import { Entreprise } from "./entreprise.entity";

@Entity()
export class UserC {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    nom: string;

    @Column()
    prenom: string;

    @Column({ unique: true })
    email: string;

    @Column()
    password: string;

    // Ligne de composition ("appartient à UNE entreprise")
    @ManyToOne(() => Entreprise, (entreprise) => entreprise.utilisateurs, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'entrepriseId' }) // Clé étrangère dans la table UserC
    entreprise: Entreprise;
}