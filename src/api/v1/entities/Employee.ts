import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { Department } from "./Department";
import { Role } from "./Role";
import { RefreshToken } from "./RefreshToken";
@Entity("employees")
export class Employee {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "first_name",type:'varchar', length: 80 }) firstName!: string;
  @Column({ name: "last_name",type:'varchar', length: 80 }) lastName!: string;
  @Column({ name: "work_email",type:'varchar', length: 254, unique: true }) workEmail!: string;
  @Column({ name: "password_hash", type: "text", nullable: true, select: false })
  passwordHash!: string | null;
  @Column({ name: "invitation_token_hash", type: "varchar", length: 64, nullable: true, select: false })
  invitationTokenHash!: string | null;
  @Column({ name: "invitation_expires_at", type: "timestamptz", nullable: true })
  invitationExpiresAt!: Date | null;
  @Column({ name: "role_id", type: "uuid", nullable: true }) roleId!: string | null;
  @ManyToOne(() => Role, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "role_id" })
  role!: Role;
  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;
  @Column({ type: "varchar", length: 30, nullable: true }) phone!:
    | string
    | null;
  @Column({ name: "department_id", type: "uuid" }) departmentId!: string;
  @ManyToOne(() => Department, (d) => d.employees, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "department_id" })
  department!: Department;
  @Column({ name: "manager_id", type: "uuid", nullable: true }) managerId!:
    | string
    | null;
  @ManyToOne(() => Employee, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "manager_id" })
  manager!: Employee | null;
  @OneToMany(() => Employee, (e) => e.manager) directReports!: Employee[];
  @Column({ name: "job_title",type:'varchar', length: 120 }) jobTitle!: string;
  @Column({ name: "joining_date", type: "date" }) joiningDate!: string;
  @Column({
    name: "employment_status",
    type: "varchar",
    length: 20,
    default: "active",
  })
  employmentStatus!: "active" | "inactive" | "on_leave";
  // Salary is intentionally optional and only returned to privileged roles.
  @Column({
    type: "numeric",
    precision: 12,
    scale: 2,
    nullable: true,
    select: false,
  })
  salary!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
  @OneToMany(() => RefreshToken, (token) => token.employee)
  refreshTokens!: RefreshToken[];
}
