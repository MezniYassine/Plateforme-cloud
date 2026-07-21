import { ChildEntity, Column, ManyToOne } from "typeorm";
import { Catalogue } from "src/catalogue/entities/catalogue.entity";
import { ServiceInstance } from "./serviceInstance.entity";

@ChildEntity()
export class MachineVirtuelle extends ServiceInstance {
  @Column()
  vCPU!: number;

  @Column()
  ramGB!: number;

  @Column()
  stockageGB!: number;

  @Column({ nullable: true })
  ipAddress!: string;

  @Column({ nullable: true })
  vmReference!: string;

  @Column({ nullable: true })
  os!: string;

  @ManyToOne(() => Catalogue, { nullable: true, eager: false, onDelete: 'SET NULL' })
  catalogue?: Catalogue | null;
}
