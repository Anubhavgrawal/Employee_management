import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Employee } from "./Employee";

export type SessionAuditEventType =
  | "session_created"
  | "session_expired"
  | "session_revoked"
  | "logout"
  | "refresh_token_reuse";

@Entity("session_audit_events")
@Index(["userId", "occurredAt"])
@Index(["eventType", "occurredAt"])
export class SessionAuditEvent {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;

  @ManyToOne(() => Employee, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Employee;

  @Column({ name: "session_id", type: "uuid" }) sessionId!: string;
  @Column({ name: "event_type", type: "varchar", length: 40 }) eventType!: SessionAuditEventType;
  @CreateDateColumn({ name: "occurred_at", type: "timestamptz" }) occurredAt!: Date;
  @Column({ name: "processed_at", type: "timestamptz", nullable: true }) processedAt!: Date | null;
  @Column({ name: "processing_status", type: "varchar", length: 20, default: "pending" })
  processingStatus!: "pending" | "processed" | "failed";
  @Column({ name: "correlation_id", type: "uuid", unique: true }) correlationId!: string;
}