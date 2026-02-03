# Record Detail Demo Script

This script fetches a linked Record and then calls the digital file endpoint.

## Usage

```bash
set API_BASE_URL=http://localhost:5000/api
set AUTH_TOKEN=your_jwt_here
set TRANSFER_ID=transfer_id_here
node server/scripts/record-detail-demo.js
```

Or for maintenance:

```bash
set API_BASE_URL=http://localhost:5000/api
set AUTH_TOKEN=your_jwt_here
set MAINTENANCE_ID=maintenance_id_here
node server/scripts/record-detail-demo.js
```

The output is the full JSON payload from:

```
GET /records/:id/detail
```
