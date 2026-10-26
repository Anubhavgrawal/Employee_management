import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Employee } from "./Employee";
@Entity("refresh_tokens")
@Index(["familyId"])
export class RefreshToken {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "employee_id", type: "uuid" }) employeeId!: string;
  @ManyToOne(() => Employee, (employee) => employee.refreshTokens, { onDelete: "CASCADE" })
  @JoinColumn({ name: "employee_id" })
  employee!: Employee;
  @Column({ name: "token_hash", type: "text", unique: true })
  tokenHash!: string;
  @Column({ name: "family_id", type: "uuid" }) familyId!: string;
  @Column({ name: "expires_at", type: "timestamptz" }) expiresAt!: Date;
  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;
  @Column({ name: "replaced_by_id", type: "uuid", nullable: true })
  replacedById!: string | null;
  @Column({ name: "user_agent", type: "text", nullable: true }) userAgent!:
    | string
    | null;
  @Column({ name: "ip_address", type: "varchar", length: 64, nullable: true })
  ipAddress!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
