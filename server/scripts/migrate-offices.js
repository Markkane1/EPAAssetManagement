const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;

if (!MONGO_URI) {
  console.error('Missing MONGO_URI or DATABASE_URL in environment');
  process.exit(1);
}

const OfficeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    division: { type: String, default: null, trim: true },
    district: { type: String, default: null, trim: true },
    address: { type: String, default: null },
    contact_number: { type: String, default: null, trim: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'offices' }
);

const OfficeModel = mongoose.model('Office', OfficeSchema);

async function fetchCollection(name) {
  const collections = await mongoose.connection.db.listCollections({ name }).toArray();
  if (collections.length === 0) return [];
  return mongoose.connection.db.collection(name).find({}).toArray();
}

async function migrate() {
  await mongoose.connect(MONGO_URI);

  const locations = await fetchCollection('locations');
  const directorates = await fetchCollection('directorates');

  const operations = [];

  locations.forEach((loc) => {
    operations.push({
      updateOne: {
        filter: { _id: loc._id },
      update: {
        $set: {
          name: loc.name,
          division: null,
          district: null,
          address: loc.address || null,
          contact_number: null,
          created_at: loc.created_at || loc.createdAt || new Date(),
          updated_at: loc.updated_at || loc.updatedAt || new Date(),
        },
      },
        upsert: true,
      },
    });
  });

  directorates.forEach((dir) => {
    operations.push({
      updateOne: {
        filter: { _id: dir._id },
      update: {
        $set: {
          name: dir.name,
          division: dir.department_code || dir.departmentCode || null,
          district: null,
          address: null,
          contact_number: null,
          created_at: dir.created_at || dir.createdAt || new Date(),
          updated_at: dir.updated_at || dir.updatedAt || new Date(),
        },
      },
        upsert: true,
      },
    });
  });

  if (operations.length > 0) {
    await OfficeModel.bulkWrite(operations);
  }

  console.log(`Migrated ${locations.length} locations and ${directorates.length} directorates into offices.`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
