const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';
const AUTH_TOKEN = process.env.AUTH_TOKEN;

const TRANSFER_ID = process.env.TRANSFER_ID;
const MAINTENANCE_ID = process.env.MAINTENANCE_ID;

if (!AUTH_TOKEN) {
  console.error('AUTH_TOKEN is required.');
  process.exit(1);
}

if (!TRANSFER_ID && !MAINTENANCE_ID) {
  console.error('Provide TRANSFER_ID or MAINTENANCE_ID to locate the linked record.');
  process.exit(1);
}

const params = new URLSearchParams();
if (TRANSFER_ID) {
  params.set('recordType', 'TRANSFER');
  params.set('transferId', TRANSFER_ID);
}
if (MAINTENANCE_ID) {
  params.set('recordType', 'MAINTENANCE');
  params.set('maintenanceRecordId', MAINTENANCE_ID);
}

async function run() {
  const listResponse = await fetch(`${API_BASE_URL}/records?${params.toString()}`, {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });

  if (!listResponse.ok) {
    const errorText = await listResponse.text();
    throw new Error(`Record lookup failed (${listResponse.status}): ${errorText}`);
  }

  const records = await listResponse.json();
  if (!records.length) {
    console.log('No linked records found.');
    return;
  }

  const recordId = records[0].id;
  const detailResponse = await fetch(`${API_BASE_URL}/records/${recordId}/detail`, {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });

  if (!detailResponse.ok) {
    const errorText = await detailResponse.text();
    throw new Error(`Record detail failed (${detailResponse.status}): ${errorText}`);
  }

  const detail = await detailResponse.json();
  console.log(JSON.stringify(detail, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
