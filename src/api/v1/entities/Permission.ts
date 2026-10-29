import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from "typeorm";
import { Role } from "./Role";
@Entity("permissions")
export class Permission {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "varchar", length: 80, unique: true }) name!: string;
  @Column({ type: "text", nullable: true }) description!: string | null;
  @ManyToMany(() => Role, (role) => role.permissions) roles!: Role[];
}
