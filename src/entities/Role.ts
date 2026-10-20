import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
} from "typeorm";
import { Permission } from "./Permission";
@Entity("roles")
export class Role {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "varchar", length: 30, unique: true }) name!:
    | "admin"
    | "hr"
    | "manager"
    | "employee";
  @Column({ type: "text", nullable: true }) description!: string | null;
  @ManyToMany(() => Permission, (p) => p.roles)
  @JoinTable({
    name: "role_permissions",
    joinColumn: { name: "role_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "permission_id", referencedColumnName: "id" },
  })
  permissions!: Permission[];
}
