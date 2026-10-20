import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Employee } from "./Employee";

@Entity("employee_documents")
@Index(["employeeId", "createdAt"])
export class EmployeeDocument {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "employee_id", type: "uuid" }) employeeId!: string;
  @ManyToOne(() => Employee, { onDelete: "CASCADE" })
  @JoinColumn({ name: "employee_id" }) employee!: Employee;
  @Column({ name: "object_key", type: "text", unique: true }) objectKey!: string;
  @Column({ name: "original_name", type: "varchar", length: 255 }) originalName!: string;
  @Column({ name: "mime_type", type: "varchar", length: 100 }) mimeType!: string;
  @Column({ name: "extension", type: "varchar", length: 10 }) extension!: string;
  @Column({ name: "size_bytes", type: "integer" }) sizeBytes!: number;
  @Column({ name: "sha256", type: "varchar", length: 64 }) sha256!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}