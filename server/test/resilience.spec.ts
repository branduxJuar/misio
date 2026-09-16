import 'reflect-metadata';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createConnection, Connection } from 'mongoose';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { StoreService } from '../src/store/store.service';
import { StoreItemSchema, RedemptionSchema } from '../src/store/store.schema';
import { UserSchema } from '../src/users/user.schema';
import { UsersService } from '../src/users/users.service';
import { TransactionSchema, TransactionStatus, TransactionType } from '../src/transactions/transaction.schema';
import { TransactionsService } from '../src/transactions/transactions.service';
import { IdempotencySchema } from '../src/common/idempotency.schema';
import { IdempotencyService } from '../src/common/idempotency.service';
import { TicketSchema } from '../src/tickets/ticket.schema';
import { TicketsService } from '../src/tickets/tickets.service';
import { RaffleSchema, RaffleStatus } from '../src/raffles/raffle.schema';
import { RaffleClosingService } from '../src/raffles/raffle-closing.service';
import { DistributedLockService } from '../src/common/distributed-lock.service';
import { TicketEmailOutboxService } from '../src/common/ticket-email-outbox.service';
import { HealthController } from '../src/common/health.controller';
import { BingoService } from '../src/bingo/bingo.service';
import { BingoRoomSchema, BingoCardSchema, BingoWinMode } from '../src/bingo/bingo.schema';

jest.setTimeout(90_000);

const describeMongo = process.env.RUN_MONGO_INTEGRATION === '1' ? describe : describe.skip;
describeMongo('Resilience with an isolated MongoDB replica set', () => {
  let repl: MongoMemoryReplSet;
  let connection: Connection;
  let users: any, items: any, orders: any, ledger: any, raffles: any, tickets: any;
  let store: StoreService, tx: TransactionsService, ticketService: TicketsService;
  let locks: DistributedLockService, closing: RaffleClosingService, bingo: BingoService;
  const notifications = { notifyUser: jest.fn(async () => ({})), notifyRaffleBuyers: jest.fn(async () => ({ notified: 0 })) };
  const promo = { validate: jest.fn(async () => ({ code: 'FREE1', value: 1 })), apply: jest.fn(async () => ({})) };
  const originalRedis = process.env.REDIS_URL;

  beforeAll(async () => {
    delete process.env.REDIS_URL;
    Logger.overrideLogger(false);
    const cachedBinary = resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe');
    repl = await MongoMemoryReplSet.create({
      binary: { version: '8.2.6', ...(existsSync(cachedBinary) ? { systemBinary: cachedBinary } : {}) },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    connection = await createConnection(repl.getUri(), { dbName: 'resilience_test' }).asPromise();
    users = connection.model('User', UserSchema);
    items = connection.model('StoreItem', StoreItemSchema);
    orders = connection.model('Redemption', RedemptionSchema);
    ledger = connection.model('Transaction', TransactionSchema);
    raffles = connection.model('Raffle', RaffleSchema);
    tickets = connection.model('Ticket', TicketSchema);
    const records = connection.model('IdempotencyRecord', IdempotencySchema);
    const rooms = connection.model('BingoRoom', BingoRoomSchema);
    const cards = connection.model('BingoCard', BingoCardSchema);
    for (const model of Object.values(connection.models)) await model.init();
    await connection.db!.createCollection('ticket_email_outbox');
    const idempotency = new IdempotencyService(records as any);
    const usersService = new UsersService(users, {} as any);
    tx = new TransactionsService(ledger, connection, usersService, promo as any, {} as any, idempotency);
    store = new StoreService(connection, items, orders, users, tx, notifications as any, {} as any, {} as any, {} as any, idempotency);
    ticketService = new TicketsService(tickets, raffles, connection, usersService, tx, promo as any,
      {} as any, {} as any, {} as any, idempotency, new TicketEmailOutboxService(connection));
    locks = new DistributedLockService();
    closing = new RaffleClosingService(connection, raffles, tickets, ledger, users, {} as any,
      notifications as any, {} as any, {} as any, {} as any, {} as any, {} as any, locks);
    bingo = new BingoService(connection, locks, rooms as any, cards as any);
  });

  afterAll(async () => {
    locks?.onModuleDestroy();
    await connection?.close();
    await repl?.stop();
    if (originalRedis !== undefined) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    notifications.notifyUser.mockResolvedValue({});
    for (const collection of Object.values(connection.collections)) await collection.deleteMany({});
  });

  const newUser = (balance = 100) => users.create({ name: 'Test User', email: 'test@example.invalid', walletBalance: balance });
  const newItem = () => items.create({ name: 'Test item', priceMisio: 10, stock: 1, saleType: 'venta' });
  const newRaffle = () => raffles.create({ title: 'Test raffle', ticketPrefix: 'TEST', ticketPrice: 5,
    totalTickets: 100, drawDate: new Date(Date.now() + 86400_000) });

  it('rolls back stock, ledger and wallet when order creation fails', async () => {
    const user = await newUser();
    const item = await newItem();
    jest.spyOn(orders, 'create').mockRejectedValueOnce(new Error('simulated order failure'));
    await expect(store.checkout(user.id, [{ itemId: item.id, qty: 1 }])).rejects.toThrow('simulated');
    expect((await users.findById(user.id)).walletBalance).toBe(100);
    expect((await items.findById(item.id)).stock).toBe(1);
    expect(await ledger.countDocuments()).toBe(0);
    expect(await orders.countDocuments()).toBe(0);
  });

  it('sells the last item once under simultaneous checkout', async () => {
    const user = await newUser();
    const item = await newItem();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () =>
      store.checkout(user.id, [{ itemId: item.id, qty: 1 }])));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await users.findById(user.id)).walletBalance).toBe(90);
    expect((await items.findById(item.id)).stock).toBe(0);
    expect(await orders.countDocuments()).toBe(1);
    expect(await ledger.countDocuments()).toBe(1);
  });

  it('replays a committed checkout despite notification failure', async () => {
    const user = await newUser();
    const item = await newItem();
    notifications.notifyUser.mockRejectedValueOnce(new Error('notification offline'));
    const first = await store.checkout(user.id, [{ itemId: item.id, qty: 1 }], undefined, 'checkout-1');
    const second = await store.checkout(user.id, [{ itemId: item.id, qty: 1 }], undefined, 'checkout-1');
    expect(String(first._id)).toBe(String(second._id));
    expect((await users.findById(user.id)).walletBalance).toBe(90);
  });

  it('persists a recoverable payment and delivers discounted tickets once', async () => {
    const user = await newUser(0);
    const raffle = await newRaffle();
    const deposit = await ledger.create({ userId: user.id, amount: 5, type: TransactionType.DEPOSIT_YAPE,
      meta: { raffleId: raffle.id, ticketNumbers: [1, 2], ticketPromoCode: 'FREE1' } });
    const confirmed = await tx.confirmDeposit(deposit.id);
    expect(confirmed!.fulfillment?.status).toBe('pending');
    expect(await tx.findUnfulfilledDeposits()).toHaveLength(1);
    await ticketService.purchase(user.id, raffle.id, { ticketNumbers: [1, 2], promoCode: 'FREE1', depositId: deposit.id, fromPendingConfirmation: true });
    expect((await users.findById(user.id)).walletBalance).toBe(0);
    expect((await ledger.findById(deposit.id)).fulfillment.status).toBe('ok');
    expect(await tickets.countDocuments()).toBe(2);
    expect(await connection.db!.collection('ticket_email_outbox').countDocuments({ status: 'pending' })).toBe(1);
    await expect(ticketService.purchase(user.id, raffle.id, { ticketNumbers: [1, 2], depositId: deposit.id })).rejects.toThrow();
    expect(await tickets.countDocuments()).toBe(2);
    expect(await ledger.countDocuments({ type: TransactionType.TICKET_PURCHASE })).toBe(1);
  });

  it('aborts a purchase when its durable email cannot be recorded', async () => {
    const user = await newUser();
    const raffle = await newRaffle();
    jest.spyOn((ticketService as any).jobsService, 'recordTicketEmail').mockRejectedValueOnce(new Error('outbox failure'));
    await expect(ticketService.purchase(user.id, raffle.id, { ticketNumbers: [1] })).rejects.toThrow('outbox failure');
    expect((await users.findById(user.id)).walletBalance).toBe(100);
    expect(await tickets.countDocuments()).toBe(0);
    expect(await ledger.countDocuments()).toBe(0);
  });

  it('rolls back the refund flag together with the money, then retries safely', async () => {
    const user = await newUser(0);
    const raffle = await newRaffle();
    raffle.status = RaffleStatus.COMPLETED;
    await raffle.save();
    const refund = () => (closing as any).persistGroupedRefunds([{ _id: user._id, count: 2 }],
      (count: number) => count * 5, 'canje', raffle.title, raffle.id);
    jest.spyOn(users, 'bulkWrite').mockRejectedValueOnce(new Error('wallet failure'));
    await expect(refund()).rejects.toThrow('wallet failure');
    expect((await raffles.findById(raffle.id)).refundsProcessed).toBe(false);
    expect(await ledger.countDocuments()).toBe(0);
    await refund();
    expect((await users.findById(user.id)).walletCanje).toBe(10);
    await expect(refund()).rejects.toThrow();
    expect((await users.findById(user.id)).walletCanje).toBe(10);
  });

  it('serializes host calls and keeps a unique called number', async () => {
    const host = await newUser();
    const { room } = await bingo.createRoom(host.id, host.name, { maxPlayers: 10, winMode: BingoWinMode.FULL });
    const calls = await Promise.allSettled(Array.from({ length: 8 }, () => bingo.callNumber(room.id, host.id)));
    const accepted = calls.filter((result) => result.status === 'fulfilled');
    const saved = await connection.model('BingoRoom').findById(room.id);
    expect(accepted).toHaveLength(1);
    expect(saved!.calledNumbers).toHaveLength(1);
    await bingo.restartRoom(room.id, host.id);
    expect((await connection.model('BingoRoom').findById(room.id))!.calledNumbers).toHaveLength(0);
  });
});

describe('Readiness', () => {
  it('returns 503 when MongoDB is disconnected', async () => {
    const health = new HealthController({ readyState: 0 } as any);
    jest.spyOn(health as any, 'redisCheck').mockResolvedValue({ status: 'ok' });
    await expect(health.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('returns 503 when configured Redis is unavailable', async () => {
    const health = new HealthController({ readyState: 1 } as any);
    jest.spyOn(health as any, 'redisCheck').mockResolvedValue({ status: 'error' });
    await expect(health.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
