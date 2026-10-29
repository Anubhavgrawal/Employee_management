import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Employee } from "./Employee";

@Entity("activity_logs")
export class ActivityLog {
  @PrimaryGeneratedColumn("uuid") id!: string;

  @Column({ name: "employee_id", type: "uuid" }) employeeId!: string;

  @ManyToOne(() => Employee, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "employee_id" })
  employee!: Employee;

  @Column({ type: "text" }) description!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}