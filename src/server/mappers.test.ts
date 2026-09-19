import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fromDbPaymentMethod, toBudget, toDbPaymentMethod, toNotification, toTransaction, toUser } from "./mappers";

describe("persistence mappers", () => {
  it("round-trips payment methods between UI labels and database enums", () => {
    assert.equal(toDbPaymentMethod("Credit Card"), "credit_card");
    assert.equal(fromDbPaymentMethod("net_banking"), "Net Banking");
    assert.equal(fromDbPaymentMethod(null), "UPI");
  });

  it("maps a user row without exposing password hashes", () => {
    const user = toUser({
      id: "8e1c0c2a-7b6d-4f3a-9c1e-2a4b6d8f0001",
      email: "ankit.kumar@spendwise.app",
      passwordHash: "should-not-leak",
      name: "Ankit Kumar",
      phone: "+91 98765 43210",
      location: "Bengaluru, India",
      occupation: "Product Engineer",
      currency: "INR",
      avatarUrl: null,
      createdAt: new Date("2024-08-14T00:00:00.000Z"),
      updatedAt: new Date("2024-08-14T00:00:00.000Z"),
    });

    assert.equal(user.avatarInitials, "AK");
    assert.equal(user.memberSince, "2024-08-14");
    assert.equal("passwordHash" in user, false);
  });

  it("maps monetary numeric strings and derived notification read state", () => {
    const transaction = toTransaction({
      id: "txn-1",
      userId: "user-1",
      categoryId: "cat-1",
      amount: "1240.00",
      type: "expense",
      description: "Dinner",
      paymentMethod: "credit_card",
      occurredOn: "2026-09-10",
      notes: null,
      createdAt: new Date("2026-09-10T10:00:00.000Z"),
      updatedAt: new Date("2026-09-10T10:00:00.000Z"),
    });

    assert.equal(transaction.amount, 1240);
    assert.equal(transaction.paymentMethod, "Credit Card");
    assert.equal(transaction.date, "2026-09-10");

    const budget = toBudget({
      id: "bdg-1",
      userId: "user-1",
      categoryId: "cat-1",
      limitAmount: "5000.00",
      period: "monthly",
      startDate: "2026-09-01",
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });

    assert.equal(budget.limit, 5000);
    assert.equal(budget.spent, 0);

    const unread = toNotification({
      id: "ntf-1",
      userId: "user-1",
      type: "insight",
      title: "Hello",
      message: "World",
      readAt: null,
      relatedEntityType: null,
      relatedEntityId: null,
      createdAt: new Date("2026-09-08T08:30:00.000Z"),
    });

    assert.equal(unread.read, false);
  });
});
