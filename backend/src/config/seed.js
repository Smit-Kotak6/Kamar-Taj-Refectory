require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./db');

async function main() {
  console.log('🌱 Starting Kamar-Taj Refectory Database Seeding...');

  // 1. Seed Default Meal Schedules (Section 8)
  const schedules = [
    {
      mealType: 'BREAKFAST',
      cutoffTime: '07:00',
      serviceStartTime: '07:30',
      serviceEndTime: '09:30'
    },
    {
      mealType: 'LUNCH',
      cutoffTime: '10:30', // Spec explicitly confirms 10:30 AM lunch cutoff
      serviceStartTime: '12:00',
      serviceEndTime: '14:30'
    },
    {
      mealType: 'DINNER',
      cutoffTime: '17:30', // Spec suggests 05:30 PM dinner cutoff
      serviceStartTime: '19:30',
      serviceEndTime: '21:30'
    }
  ];

  for (const s of schedules) {
    await prisma.mealSchedule.upsert({
      where: { mealType: s.mealType },
      update: s,
      create: s
    });
  }
  console.log('✅ Default meal schedules configured (Breakfast, Lunch, Dinner).');

  // Password for initial test accounts
  const salt = await bcrypt.genSalt(10);
  const commonPassword = await bcrypt.hash('Mnnit@123', salt);

  // 2. Seed Default Admin Account
  const admin = await prisma.user.upsert({
    where: { email: 'admin@mnnit.ac.in' },
    update: {},
    create: {
      name: 'Mess Warden Admin',
      email: 'admin@mnnit.ac.in',
      password: commonPassword,
      role: 'ADMIN',
      phone: '9876543210'
    }
  });
  console.log(`✅ Default Admin user ready: ${admin.email} (Password: Mnnit@123)`);

  // 3. Seed Default Staff Account
  const staff = await prisma.user.upsert({
    where: { email: 'staff@mnnit.ac.in' },
    update: {},
    create: {
      name: 'Ramesh Singh (Mess Staff)',
      email: 'staff@mnnit.ac.in',
      password: commonPassword,
      role: 'STAFF',
      phone: '9876543211'
    }
  });
  console.log(`✅ Default Staff user ready: ${staff.email} (Password: Mnnit@123)`);

  // 4. Seed Demo Student with active membership
  const student = await prisma.user.upsert({
    where: { email: 'student@mnnit.ac.in' },
    update: {},
    create: {
      name: 'Aarav Sharma',
      email: 'student@mnnit.ac.in',
      password: commonPassword,
      role: 'STUDENT',
      regNo: '2023CS01',
      roomNo: 'C-204, Raman Hostel',
      phone: '9876543212',
      membership: {
        create: {
          startDate: new Date(),
          endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months
          isActive: true
        }
      }
    }
  });
  console.log(`✅ Default Demo Student ready: ${student.email} (Password: Mnnit@123)`);

  console.log('\n🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
