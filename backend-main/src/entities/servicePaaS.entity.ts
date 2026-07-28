import { ChildEntity, Column, ManyToOne } from 'typeorm';
import { TypeSgbd } from 'src/enum/type-sgbd.enum';
import { ServiceInstance } from './serviceInstance.entity';
import { Catalogue } from 'src/catalogue/entities/catalogue.entity';

@ChildEntity()
export class ServicePaaS extends ServiceInstance {
    @Column({ type: 'varchar', length: 50 })
    typeSgbd!: TypeSgbd;

    @Column()
    dbUser!: string;

    @Column()
    dbPassword!: string;

    @Column()
    hostIp!: string;

    @Column({ type: 'int' })
    port!: number;

    @Column({ type: 'text', nullable: true })
    connectionString!: string;

    @ManyToOne(() => Catalogue, { nullable: true, eager: false, onDelete: 'SET NULL' })
    catalogue?: Catalogue | null;
}