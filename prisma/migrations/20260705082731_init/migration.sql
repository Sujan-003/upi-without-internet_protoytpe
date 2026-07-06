-- CreateTable
CREATE TABLE "Account" (
    "vpa" TEXT NOT NULL PRIMARY KEY,
    "holderName" TEXT NOT NULL,
    "balance" DECIMAL NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "packetHash" TEXT NOT NULL,
    "senderVpa" TEXT NOT NULL,
    "receiverVpa" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "signedAt" DATETIME NOT NULL,
    "settledAt" DATETIME NOT NULL,
    "bridgeNodeId" TEXT NOT NULL,
    "hopCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_packetHash_key" ON "Transaction"("packetHash");
