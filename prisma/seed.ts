import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: "coe" },
    update: {},
    create: {
      name: "College of Engineering",
      domain: "coe.university.edu",
      slug: "coe",
      settings: {
        create: {
          requestPrefix: "COE",
          currentRequestNumber: 3,
          requireAdvisorApproval: true,
        },
      },
    },
  });

  console.log("Created tenant:", tenant.name);

  // Create users
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@coe.university.edu" },
    update: {},
    create: {
      email: "admin@coe.university.edu",
      name: "Admin User",
      role: "SUPER_ADMIN",
      tenantId: tenant.id,
      active: true,
    },
  });

  const staffUser = await prisma.user.upsert({
    where: { email: "staff@coe.university.edu" },
    update: {},
    create: {
      email: "staff@coe.university.edu",
      name: "Staff Member",
      role: "ADMIN_STAFF",
      tenantId: tenant.id,
      active: true,
    },
  });

  const studentUser = await prisma.user.upsert({
    where: { email: "student@coe.university.edu" },
    update: {},
    create: {
      email: "student@coe.university.edu",
      name: "Alex Student",
      role: "STUDENT",
      tenantId: tenant.id,
      active: true,
    },
  });

  console.log("Created users:", adminUser.email, staffUser.email, studentUser.email);

  // Create organizations
  const roboticsClub = await prisma.organization.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "ROB" } },
    update: {},
    create: {
      name: "Robotics Club",
      code: "ROB",
      tenantId: tenant.id,
      active: true,
    },
  });

  const aeroSociety = await prisma.organization.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "AER" } },
    update: {},
    create: {
      name: "Aerospace Society",
      code: "AER",
      tenantId: tenant.id,
      active: true,
    },
  });

  const engCouncil = await prisma.organization.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "ENC" } },
    update: {},
    create: {
      name: "Engineering Council",
      code: "ENC",
      tenantId: tenant.id,
      active: true,
    },
  });

  console.log("Created organizations:", roboticsClub.name, aeroSociety.name, engCouncil.name);

  // Create budgets
  await prisma.budget.upsert({
    where: { organizationId_fiscalYear_name: { organizationId: roboticsClub.id, fiscalYear: "2024-2025", name: "General" } },
    update: {},
    create: {
      organizationId: roboticsClub.id,
      fiscalYear: "2024-2025",
      allocated: 5000,
      spent: 1250.50,
      reserved: 650,
    },
  });

  await prisma.budget.upsert({
    where: { organizationId_fiscalYear_name: { organizationId: aeroSociety.id, fiscalYear: "2024-2025", name: "General" } },
    update: {},
    create: {
      organizationId: aeroSociety.id,
      fiscalYear: "2024-2025",
      allocated: 5000,
      spent: 800,
      reserved: 1200,
    },
  });

  await prisma.budget.upsert({
    where: { organizationId_fiscalYear_name: { organizationId: engCouncil.id, fiscalYear: "2024-2025", name: "General" } },
    update: {},
    create: {
      organizationId: engCouncil.id,
      fiscalYear: "2024-2025",
      allocated: 5000,
      spent: 420,
      reserved: 0,
    },
  });

  console.log("Created budgets");

  // Add student as org member
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: roboticsClub.id, userId: studentUser.id } },
    update: {},
    create: {
      organizationId: roboticsClub.id,
      userId: studentUser.id,
      memberRole: "TREASURER",
    },
  });

  // Create sample purchase requests
  const req1 = await prisma.purchaseRequest.upsert({
    where: { number: "COE-2025-0001" },
    update: {},
    create: {
      number: "COE-2025-0001",
      title: "Arduino Mega 2560 Controllers (x5)",
      description: "Microcontroller boards for autonomous robot competition build",
      justification: "Required for the FIRST Robotics 2025 regional competition. These controllers will power the main drive train and sensor array systems.",
      organizationId: roboticsClub.id,
      submittedById: studentUser.id,
      assignedToId: staffUser.id,
      status: "ORDERED",
      priority: "HIGH",
      advisorEmail: "prof.jones@coe.university.edu",
      advisorName: "Prof. Jones",
      vendorName: "DigiKey",
      vendorUrl: "https://www.digikey.com",
      totalEstimated: 245.00,
      submittedAt: new Date("2025-01-10"),
      neededBy: new Date("2025-02-01"),
    },
  });

  // Add items to req1
  const existingItems1 = await prisma.requestItem.findFirst({ where: { requestId: req1.id } });
  if (!existingItems1) {
    await prisma.requestItem.createMany({
      data: [
        {
          requestId: req1.id,
          name: "Arduino Mega 2560 REV3",
          quantity: 5,
          unitPrice: 45.00,
          totalPrice: 225.00,
          url: "https://www.digikey.com/product-detail/arduino-mega",
        },
        {
          requestId: req1.id,
          name: "USB-B Cable",
          quantity: 5,
          unitPrice: 4.00,
          totalPrice: 20.00,
        },
      ],
    });
  }

  await prisma.auditLog.create({
    data: {
      requestId: req1.id,
      userId: studentUser.id,
      action: "SUBMITTED",
      details: "Request submitted for advisor approval",
    },
  });

  await prisma.auditLog.create({
    data: {
      requestId: req1.id,
      userId: staffUser.id,
      action: "STATUS_CHANGED",
      details: "Status changed from APPROVED to ORDERED",
    },
  });

  const req2 = await prisma.purchaseRequest.upsert({
    where: { number: "COE-2025-0002" },
    update: {},
    create: {
      number: "COE-2025-0002",
      title: "Wind Tunnel Model Materials",
      description: "Balsa wood and foam board for aerodynamic scale model testing",
      justification: "Semester project materials for subsonic wind tunnel testing lab. Models will be used for multiple semesters.",
      organizationId: aeroSociety.id,
      submittedById: studentUser.id,
      status: "PENDING_APPROVAL",
      priority: "NORMAL",
      advisorEmail: "dr.chen@coe.university.edu",
      advisorName: "Dr. Chen",
      vendorName: "Aerospace Composites",
      totalEstimated: 380.00,
      submittedAt: new Date("2025-01-15"),
      neededBy: new Date("2025-02-15"),
    },
  });

  const existingItems2 = await prisma.requestItem.findFirst({ where: { requestId: req2.id } });
  if (!existingItems2) {
    await prisma.requestItem.createMany({
      data: [
        {
          requestId: req2.id,
          name: "Balsa Wood Sheets (1/8 in, pkg of 10)",
          quantity: 4,
          unitPrice: 32.00,
          totalPrice: 128.00,
        },
        {
          requestId: req2.id,
          name: "High-Density Foam Board",
          quantity: 10,
          unitPrice: 18.00,
          totalPrice: 180.00,
        },
        {
          requestId: req2.id,
          name: "Epoxy Adhesive Kit",
          quantity: 3,
          unitPrice: 24.00,
          totalPrice: 72.00,
        },
      ],
    });
  }

  await prisma.auditLog.create({
    data: {
      requestId: req2.id,
      userId: studentUser.id,
      action: "SUBMITTED",
      details: "Request submitted for advisor approval",
    },
  });

  const req3 = await prisma.purchaseRequest.upsert({
    where: { number: "COE-2025-0003" },
    update: {},
    create: {
      number: "COE-2025-0003",
      title: "End-of-Year Banquet Supplies",
      description: "Catering and event supplies for annual engineering council awards banquet",
      justification: "Annual tradition recognizing outstanding engineering students and organizations. Budget approved by student affairs.",
      organizationId: engCouncil.id,
      submittedById: studentUser.id,
      status: "READY_FOR_PICKUP",
      priority: "NORMAL",
      advisorEmail: "advisor@coe.university.edu",
      advisorName: "Ms. Williams",
      totalEstimated: 420.00,
      totalActual: 415.50,
      submittedAt: new Date("2025-01-05"),
      neededBy: new Date("2025-01-20"),
      readyAt: new Date("2025-01-18"),
    },
  });

  const existingItems3 = await prisma.requestItem.findFirst({ where: { requestId: req3.id } });
  if (!existingItems3) {
    await prisma.requestItem.createMany({
      data: [
        {
          requestId: req3.id,
          name: "Paper plates and napkins (bulk)",
          quantity: 1,
          unitPrice: 45.00,
          totalPrice: 45.00,
        },
        {
          requestId: req3.id,
          name: "Catering from Campus Dining",
          quantity: 1,
          unitPrice: 350.00,
          totalPrice: 350.00,
        },
        {
          requestId: req3.id,
          name: "Award plaques (x5)",
          quantity: 5,
          unitPrice: 5.00,
          totalPrice: 25.00,
        },
      ],
    });
  }

  await prisma.auditLog.create({
    data: {
      requestId: req3.id,
      userId: adminUser.id,
      action: "STATUS_CHANGED",
      details: "Items received and ready for pickup",
    },
  });

  console.log("Created purchase requests:", req1.number, req2.number, req3.number);
  console.log("\nSeed complete!");
  console.log("\nLogin credentials:");
  console.log("  Super Admin: admin@coe.university.edu (any password)");
  console.log("  Admin Staff: staff@coe.university.edu (any password)");
  console.log("  Student:     student@coe.university.edu (any password)");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
