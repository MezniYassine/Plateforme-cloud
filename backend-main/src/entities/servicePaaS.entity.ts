import { ChildEntity, Column, ManyToOne } from 'typeorm';
import { TypeSgbd } from 'src/enum/type-sgbd.enum';
import { ServiceInstance } from './serviceInstance.entity';

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

}