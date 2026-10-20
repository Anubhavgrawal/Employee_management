import "reflect-metadata";
import { AppDataSource } from "../config/database";
import { Role } from "../entities/Role";
import { Permission } from "../entities/Permission";
import { Department } from "../entities/Department";
import { Employee } from "../entities/Employee";
import argon2 from "argon2";
async function seed() {
  await AppDataSource.initialize();
  try {
    const roles = AppDataSource.getRepository(Role),
      perms = AppDataSource.getRepository(Permission),
      deps = AppDataSource.getRepository(Department);
    const permissionNames = [
      "employee:read",
      "employee:create",
      "employee:update",
      "employee:deactivate",
      "department:manage",
      "user:role:assign",
      "session:revoke",
      "audit:read",
    ];
    for (const name of permissionNames)
      if (!(await perms.findOne({ where: { name } })))
        await perms.save(perms.create({ name, description: `Allows ${name}` }));
    const map: Record<string, string[]> = {
      admin: permissionNames,
      hr: [
        "employee:read",
        "employee:create",
        "employee:update",
        "employee:deactivate",
        "department:manage",
      ],
      manager: ["employee:read", "employee:update"],
      employee: [],
    };
    for (const name of Object.keys(map)) {
      let role = await roles.findOne({
        where: { name: name as Role["name"] },
        relations: { permissions: true },
      });
      if (!role)
        role = roles.create({
          name: name as Role["name"],
          description: `${name} role`,
        });
      role.permissions = await perms.find({
        where: map[name].map((n) => ({ name: n })),
      });
      await roles.save(role);
    }
    if (!(await deps.findOne({ where: { name: "Engineering" } })))
      await deps.save(
        deps.create({
          name: "Engineering",
          description: "Development and engineering (development seed)",
        }),
      );
    // Development-only demo accounts. Set SEED_PASSWORD before running; never use these accounts in production.
    if (process.env.NODE_ENV === "production")
      throw new Error("Refusing to seed demo accounts in production");
    const password = process.env.SEED_PASSWORD;
    if (!password || password.length < 12)
      throw new Error(
        "Set SEED_PASSWORD to a development password of at least 12 characters",
      );
    const adminRole = await roles.findOneByOrFail({ name: "admin" });
    const adminEmail = "admin@example.test";
    const employeeRepo = AppDataSource.getRepository(Employee);
    const admin = await employeeRepo.findOne({ where: { workEmail: adminEmail } });
    const adminUser = admin || employeeRepo.create({
      firstName: "System",
      lastName: "Administrator",
      workEmail: adminEmail,
      departmentId: (await deps.findOneByOrFail({ name: "Engineering" })).id,
      jobTitle: "System administrator",
      joiningDate: new Date().toISOString().slice(0, 10),
      employmentStatus: "active",
    });
    adminUser.passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    adminUser.roleId = adminRole.id;
    adminUser.isActive = true;
    await employeeRepo.save(adminUser);
    console.log("Development seed completed. Demo admin: admin@example.test");
  } finally {
    await AppDataSource.destroy();
  }
}
seed().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
