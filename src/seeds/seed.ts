import "reflect-metadata";
import { AppDataSource } from "../config/database";
import { Role } from "../api/v1/entities/Role";
import { Permission } from "../api/v1/entities/Permission";
import { Department } from "../api/v1/entities/Department";
import { Employee } from "../api/v1/entities/Employee";
import argon2 from "argon2";
import { roles as roleConstants } from "../constants";
async function seed() {
  let initialized = false;
  try {
    await AppDataSource.initialize();
    initialized = true;
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
      [roleConstants.ADMIN]: permissionNames,
      [roleConstants.HR]: [
        "employee:read",
        "employee:create",
        "employee:update",
        "employee:deactivate",
        "department:manage",
      ],
      [roleConstants.MANAGER]: ["employee:read", "employee:update"],
      [roleConstants.EMPLOYEE]: [],
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
    const adminRole = await roles.findOneByOrFail({ name: roleConstants.ADMIN });
    const employeeRepo = AppDataSource.getRepository(Employee);
    const engineering = await deps.findOneByOrFail({ name: "Engineering" });
    const accounts = [
      { email: "admin@example.test", firstName: "System", lastName: "Administrator", title: "System administrator", role: adminRole },
      { email: "hr@example.test", firstName: "Demo", lastName: "HR", title: "HR specialist", role: await roles.findOneByOrFail({ name: roleConstants.HR }) },
      { email: "manager@example.test", firstName: "Demo", lastName: "Manager", title: "Engineering manager", role: await roles.findOneByOrFail({ name: roleConstants.MANAGER }) },
      { email: "employee@example.test", firstName: "Demo", lastName: "Employee", title: "Software engineer", role: await roles.findOneByOrFail({ name: roleConstants.EMPLOYEE }) },
    ];
    for (const account of accounts) {
      const user =
        (await employeeRepo.findOne({ where: { workEmail: account.email } })) ||
        employeeRepo.create({
          firstName: account.firstName,
          lastName: account.lastName,
          workEmail: account.email,
          departmentId: engineering.id,
          jobTitle: account.title,
          joiningDate: new Date().toISOString().slice(0, 10),
          employmentStatus: "active",
        });
      user.firstName = account.firstName;
      user.lastName = account.lastName;
      user.departmentId = engineering.id;
      user.jobTitle = account.title;
      user.passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      user.roleId = account.role.id;
      user.invitationTokenHash = null;
      user.invitationExpiresAt = null;
      user.isActive = true;
      await employeeRepo.save(user);
    }
    console.log("Development seed completed. Demo accounts: admin@example.test, hr@example.test, manager@example.test, employee@example.test");
  } finally {
    if (initialized && AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}
seed().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error("Seed failed:", message);
  process.exitCode = 1;
});
