import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { Employee } from "./Employee";
@Entity("departments")
export class Department {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "varchar", length: 100, unique: true }) name!: string;
  @Column({ type: "text", nullable: true }) description!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
  @OneToMany(() => Employee, (employee) => employee.department)
  employees!: Employee[];
}
