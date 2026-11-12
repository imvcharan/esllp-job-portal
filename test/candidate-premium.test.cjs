const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { test } = require("node:test");
const {
  CandidatePremiumOrder,
} = require("../dist/users/candidate-premium-order.entity.js");
const {
  CandidatePremiumProduct,
} = require("../dist/users/candidate-premium-product.entity.js");
const {
  CandidatePremiumService,
} = require("../dist/users/candidate-premium.service.js");
const {
  CandidateProfile,
} = require("../dist/users/candidate-profile.entity.js");

test("candidate premium verification checks Razorpay payment and activates the configured boost", async () => {
  const previousSecret = process.env.RAZORPAY_KEY_SECRET;
  const previousKey = process.env.RAZORPAY_KEY_ID;
  const previousFetch = global.fetch;
  process.env.RAZORPAY_KEY_SECRET = "test-secret";
  process.env.RAZORPAY_KEY_ID = "test-key";

  const order = {
    id: 8,
    razorpayOrderId: "order_123",
    razorpayPaymentId: null,
    userId: 4,
    productKey: "profile-boost",
    productName: "Profile boost",
    productDescription: "Boost description",
    amountPaise: 29900,
    fulfillmentDays: 30,
    currency: "INR",
    paymentStatus: "pending",
    fulfillmentStatus: "pending",
    fulfillmentNote: null,
    paidAt: null,
    fulfilledAt: null,
    createdAt: new Date(),
  };
  const profile = { premiumBoostUntil: null };
  const orders = {
    findOneBy: async (where) => {
      assert.deepEqual(where, { razorpayOrderId: "order_123", userId: 4 });
      return order;
    },
  };
  const profiles = {};
  const products = {};
  const audit = { record: async () => undefined };
  const orderRepository = {
    findOne: async () => order,
    save: async (value) => value,
  };
  const productRepository = {
    findOneBy: async () => ({
      key: "profile-boost",
      fulfillmentDays: 5,
    }),
  };
  const profileRepository = {
    findOne: async () => profile,
    save: async (value) => value,
  };
  const dataSource = {
    transaction: (callback) =>
      callback({
        getRepository(entity) {
          if (entity === CandidatePremiumOrder) return orderRepository;
          if (entity === CandidatePremiumProduct) return productRepository;
          if (entity === CandidateProfile) return profileRepository;
          throw new Error("Unexpected repository");
        },
      }),
  };
  const service = new CandidatePremiumService(
    dataSource,
    products,
    orders,
    profiles,
    audit,
    {
      credentials: async () => ({
        keyId: "test-key",
        apiSecret: "test-secret",
        webhookSecret: "webhook-secret",
        enabled: true,
      }),
    },
  );
  const signature = createHmac("sha256", "test-secret")
    .update("order_123|pay_123")
    .digest("hex");
  const verificationStartedAt = Date.now();
  global.fetch = async (url) => {
    assert.match(url, /\/payments\/pay_123$/);
    return new Response(
      JSON.stringify({
        order_id: "order_123",
        status: "captured",
        amount: 29900,
        currency: "INR",
      }),
      { status: 200 },
    );
  };

  try {
    const result = await service.verifyPayment(
      { id: 4 },
      {
        orderId: "order_123",
        paymentId: "pay_123",
        signature,
      },
    );
    assert.equal(result.paymentStatus, "paid");
    assert.equal(result.fulfillmentStatus, "completed");
    assert.equal(order.razorpayPaymentId, "pay_123");
    assert.ok(
      profile.premiumBoostUntil.getTime() >=
        verificationStartedAt + 30 * 24 * 60 * 60 * 1000,
    );
    assert.ok(
      profile.premiumBoostUntil.getTime() <=
        Date.now() + 30 * 24 * 60 * 60 * 1000,
    );
  } finally {
    global.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousSecret;
    if (previousKey === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKey;
  }
});

test("candidate premium rejects a forged payment signature before contacting Razorpay", async () => {
  const previousSecret = process.env.RAZORPAY_KEY_SECRET;
  const previousKey = process.env.RAZORPAY_KEY_ID;
  const previousFetch = global.fetch;
  process.env.RAZORPAY_KEY_SECRET = "test-secret";
  process.env.RAZORPAY_KEY_ID = "test-key";
  global.fetch = async () => {
    throw new Error("Razorpay must not be contacted for an invalid signature");
  };
  const service = new CandidatePremiumService(
    {},
    {},
    { findOneBy: async () => ({}) },
    {},
    { record: async () => undefined },
    {
      credentials: async () => ({
        keyId: "test-key",
        apiSecret: "test-secret",
        webhookSecret: "webhook-secret",
        enabled: true,
      }),
    },
  );

  try {
    await assert.rejects(
      service.verifyPayment(
        { id: 4 },
        {
          orderId: "order_123",
          paymentId: "pay_123",
          signature: "0".repeat(64),
        },
      ),
      (error) => error.getStatus() === 400,
    );
  } finally {
    global.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousSecret;
    if (previousKey === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKey;
  }
});

test("candidate premium webhook verifies raw-body signatures and processes captured payments once", async () => {
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = "webhook-secret";
  const order = {
    id: 9,
    razorpayOrderId: "order_review",
    razorpayPaymentId: null,
    userId: 6,
    productKey: "resume-review",
    productName: "Resume review",
    productDescription: "Review description",
    amountPaise: 49900,
    fulfillmentDays: 0,
    currency: "INR",
    paymentStatus: "pending",
    fulfillmentStatus: "pending",
    fulfillmentNote: null,
    paidAt: null,
    fulfilledAt: null,
    createdAt: new Date(),
  };
  const audits = [];
  const rootOrders = {
    findOneBy: async () => order,
  };
  const orderRepository = {
    findOne: async () => order,
    save: async (value) => value,
  };
  const dataSource = {
    transaction: (callback) =>
      callback({
        getRepository(entity) {
          if (entity === CandidatePremiumOrder) return orderRepository;
          if (entity === CandidatePremiumProduct)
            return {
              findOneBy: async () => ({
                key: "resume-review",
                fulfillmentDays: 0,
              }),
            };
          throw new Error("Unexpected repository");
        },
      }),
  };
  const service = new CandidatePremiumService(
    dataSource,
    {},
    rootOrders,
    {},
    { record: async (entry) => audits.push(entry) },
    {
      credentials: async () => ({
        keyId: "test-key",
        apiSecret: "test-secret",
        webhookSecret: "webhook-secret",
        enabled: true,
      }),
    },
  );
  const body = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_review",
          order_id: "order_review",
          status: "captured",
          amount: 49900,
          currency: "INR",
        },
      },
    },
  };
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = createHmac("sha256", "webhook-secret")
    .update(rawBody)
    .digest("hex");

  try {
    const first = await service.handleRazorpayWebhook(rawBody, signature, body);
    const repeated = await service.handleRazorpayWebhook(
      rawBody,
      signature,
      body,
    );
    assert.equal(first.order.paymentStatus, "paid");
    assert.equal(first.order.fulfillmentStatus, "pending");
    assert.equal(repeated.order.paymentStatus, "paid");
    assert.equal(audits.length, 1);
  } finally {
    if (previousSecret === undefined)
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
  }
});
