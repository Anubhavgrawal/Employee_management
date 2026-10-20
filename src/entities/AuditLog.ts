import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";
@Entity("audit_logs")
@Index(["timestamp"])
export class AuditLog {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "actor_employee_id", type: "uuid", nullable: true })
  actorEmployeeId!: string | null;
  @Column({ type: "varchar", length: 100 }) action!: string;
  @Column({ name: "resource_type", type: "varchar", length: 80 })
  resourceType!: string;
  @Column({ name: "resource_id", type: "uuid", nullable: true }) resourceId!:
    | string
    | null;
  @Column({ name: "request_id", type: "uuid", nullable: true }) requestId!:
    | string
    | null;
  @Column({ type: "jsonb", nullable: true }) metadata!: Record<
    string,
    unknown
  > | null;
  @CreateDateColumn({ name: "timestamp", type: "timestamptz" })
  timestamp!: Date;
}
