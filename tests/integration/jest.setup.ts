import mongoose from "mongoose";

afterEach(async () => {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});
