# Offline UPI Payment Backend Simulator | Node.js, Express, Prisma, SQLite

A simulation backend for an internet-free payment pipeline where an offline user can safely route a digital payment packet through a nearby, connected device (bridge) to reach the bank's servers.

## Key Features
- **Internet-Free Pipeline:** Simulated an internet-free payment pipeline where an offline user can safely route a digital payment packet through a nearby, connected device to reach the bank's servers.
- **End-to-End Security:** Protected sensitive banking data from middlemen by combining AES and RSA encryption, ensuring the intermediate device forwarding the payment cannot read the user’s PIN or transaction details.
- **Double-Spending Prevention:** Prevented duplicate charges and double-spending by generating unique transaction tokens and using Prisma database constraints to automatically drop identical, overlapping requests.
- **Replay Attack Protection:** Blocked replay attacks by embedding an expiration timestamp (Time-To-Live) into each payment packet, causing the backend to reject any transaction reused outside a tight 60-second window (configurable validation window).

## Important Caveats & Scope
- **This is NOT a real UPI/NPCI integration.** It is a conceptual proof-of-concept for offline payment validation.
- **This does NOT use real Bluetooth or BLE.** It simulates mesh propagation using virtual, in-memory device objects inside the server.
- **This uses demo-only key management.** RSA-2048 keys are generated in-memory on application startup rather than stored in a secure HSM/KMS.
- **This simulates bridge upload.** Bridge devices are simulated using in-memory virtual devices that upload packets to the server when they reach simulated connectivity.

---

## Technical Stack
- **Node.js** (ES Modules, `"type": "module"`)
- **Express.js** (HTTP API router)
- **Prisma** + **SQLite** (Local ledger & accounts database)
- **Node.js Native Crypto Module** (RSA-OAEP SHA-256 + AES-256-GCM hybrid encryption)
- **Jest** (Unit & Concurrency testing)

---

flowchart TD
  A["Packet arrives"] --> B["Calculate packet hash"]
  B --> C["Check in-memory duplicate cache"]
  
  C -->|Duplicate| X["Drop duplicate"]
  C -->|New| D["Decrypt packet"]
  
  D --> E["Check timestamp valid?"]
  E -->|Expired| X
  
  E --> F["Atomic DB Upsert:<br/>Set status to PENDING"]
  
  F -->|Already Exists/Success| X
  F -->|Already Pending| J["Return 429 / Retry Later"]
  
  F -->|New/Allowed| G["Execute Settlement"]
  
  G -->|Success| H["Update DB: SUCCESS<br/>Evict Memory Cache"]
  G -->|Temporary Failure| I["Update DB: FAILED<br/>Release Memory Claim"]
  
  I --> K["Return error with packet hash"] --> A

--- 


## Directory Structure
```
upi-mesh-js/
├── prisma/
│   ├── schema.prisma   # SQLite Database Schema
│   └── seed.js         # Fallback seed script (Alice, Bob, Carol, Dave)
├── src/
│   ├── app.js          # Express app configurations & logging middleware
│   ├── server.js       # App entry point (seeds DB & listens on port 8080)
│   ├── db.js           # Shared PrismaClient connection instance
│   ├── crypto/
│   │   ├── server-key-holder.js      # Keypair generator & server key keeper
│   │   └── hybrid-crypto.service.js  # RSA-OAEP + AES-GCM packaging logic
│   ├── repositories/
│   │   ├── account.repository.js     # Account DAO with JPA-style Optimistic Locking
│   │   └── transaction.repository.js # Transaction DAO (top 20 ledger logs)
│   ├── services/
│   │   ├── demo.service.js             # Formulates PaymentInstructions & MeshPackets
│   │   ├── mesh-simulator.service.js   # Manages virtual devices & gossip rounds
│   │   ├── virtual-device.js           # Simulated mobile phone representation
│   │   ├── bridge-ingestion.service.js # Validation pipeline (idempotency, age, decrypt)
│   │   ├── idempotency.service.js      # SETNX style in-memory map + TTL eviction
│   │   └── settlement.service.js       # Database updates inside isolation transactional blocks
│   ├── routes/
│   │   ├── api.routes.js        # Controller routes mapping to simulator & bridge endpoints
│   │   └── dashboard.routes.js  # Router serving dashboard.html
│   └── public/
│       └── dashboard.html       # Clean client dashboard with status logs & network panels
├── tests/
│   ├── crypto.test.js                    # Unit tests validating hybrid crypto operations
│   └── idempotency-concurrency.test.js   # Parallel storm tests checking settlement safety
└── package.json
```

---

## Setup & Running Instructions

### 1. Prerequisites
Ensure you have **Node.js v18+** installed. (Tested on v25.9.0).

### 2. Install Dependencies
Navigate into the subfolder and install npm modules:
```bash
cd upi-mesh-js
npm install
```

### 3. Run Database Migrations
Create the SQLite database file (`prisma/dev.db`) and apply schemas:
```bash
npx prisma migrate dev --name init
```
This command automatically generates the Prisma Client and triggers the database seed script.

### 4. Seed the Database (Optional)
If you need to re-seed demo accounts:
```bash
npm run prisma:seed
```

### 5. Start the Server
Run in development mode (hot reloading is not enabled by default, but runs natively):
```bash
npm run dev
```
The server will start at **http://localhost:8080**.

---

## Testing

To run the automated test suite (validating the hybrid cryptosystem and parallel storm uploads):
```bash
npm run test
```

The test runner utilizes `node --experimental-vm-modules` to support ES module syntax inside Jest without requiring Babel compilation.

---

## Simulation Demo Flow

1. **Compose Payment (Step 1)**:
   - Select a sender (e.g. `alice@demo`) and receiver (`bob@demo`).
   - Enter an amount (e.g. ₹500) and PIN.
   - Click **Inject into Mesh**.
   - *Under the hood*: The simulated sender phone builds a `PaymentInstruction`, encrypts the JSON bytes using a fresh random AES key, encrypts that AES key with the server's public key, and packages them together. The resulting `MeshPacket` is injected into `phone-alice`.

2. **Gossip Round (Step 2)**:
   - Click **Run Gossip Round**.
   - *Under the hood*: Every device transmits a copy of its packets to all other neighboring devices (if the neighbor does not hold it already). The packet's TTL is decremented by 1 at each hop. Packets that reach TTL 0 will reside on that phone but won't be forwarded further.

3. **Bridge Node Upload (Step 3)**:
   - Once a gossip round carries the packet to `phone-bridge` (which has simulated 4G internet), click **Bridges Upload to Backend**.
   - *Under the hood*: All bridge devices concurrently upload their held packets to `/api/bridge/ingest`.
   - The server hashes the ciphertext. The **Idempotency Cache** locks the hash. If multiple bridges upload the same packet concurrently, only the first upload completes validation and updates the ledger. The others are dropped as duplicates (`DUPLICATE_DROPPED`).
   - The server decrypts the ciphertext, checks packet freshness (validation window), and transfers funds inside a database transaction with optimistic locking.

4. **Reset**:
   - Click **Reset Mesh + Cache** to clear the virtual devices' memory and clear the server's idempotency cache for another run.
