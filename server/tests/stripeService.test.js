import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildPaymentRetryPayload,
    createBatchCheckoutSession,
    createBookingCheckoutSession,
    getPaymentErrorCode,
    getPaymentErrorStatus,
    getStripeClient,
    toStripeUnitAmount,
} from '../services/stripeService.js';
import { redisTtl } from '../services/redisKeys.js';

test('Stripe config errors map to 503', () => {
    assert.throws(() => getStripeClient({}), (error) => (
        getPaymentErrorStatus(error) === 503
        && getPaymentErrorCode(error) === 'PAYMENT_CONFIG_UNAVAILABLE'
    ));
});

test('Stripe upstream errors map to 502', () => {
    const error = { type: 'StripeAPIError', requestId: 'req_test' };
    assert.equal(getPaymentErrorStatus(error), 502);
    assert.equal(getPaymentErrorCode(error), 'PAYMENT_PROVIDER_UNAVAILABLE');
});

test('amount validation requires a finite value of at least 50 cents', () => {
    assert.equal(toStripeUnitAmount(12.34), 1234);
    assert.throws(() => toStripeUnitAmount(Number.NaN), /positive finite/);
    assert.throws(() => toStripeUnitAmount(0.49), /at least 50 cents/);
});

test('retry payload preserves pending booking and hold information', () => {
    const booking = {
        _id: 'booking-1',
        holdExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
        status: 'pending',
        isPaid: false,
    };
    const payload = buildPaymentRetryPayload({ booking, message: 'retry' });
    assert.equal(payload.bookingId, 'booking-1');
    assert.equal(payload.retryPayment, true);
    assert.equal(payload.retryEndpoint, '/api/booking/pay-now');
    assert.equal(payload.code, 'PAYMENT_SESSION_FAILED');
    assert.equal(booking.status, 'pending');
    assert.equal(booking.isPaid, false);
});

test('single booking checkout uses validated amount and retry metadata', async () => {
    let request;
    const stripe = {
        checkout: {
            sessions: {
                create: async (payload) => {
                    request = payload;
                    return { id: 'cs_test_single', url: 'https://checkout.stripe.test/single' };
                },
            },
        },
    };
    const before = Math.floor(Date.now() / 1000);
    const result = await createBookingCheckoutSession({
        booking: { _id: 'booking-1', amount: 12.34, user: 'user-1' },
        movieTitle: 'Test Movie',
        origin: 'http://localhost:5173',
        userId: 'user-1',
    }, stripe);

    assert.equal(result.url, 'https://checkout.stripe.test/single');
    assert.equal(request.line_items[0].price_data.unit_amount, 1234);
    assert.equal(request.metadata.bookingId, 'booking-1');
    assert.equal(request.client_reference_id, 'booking-1');
    const after = Math.floor(Date.now() / 1000);
    assert.ok(request.expires_at >= before + 1860);
    assert.ok(request.expires_at >= before + redisTtl.seatHold);
    assert.ok(request.expires_at <= after + redisTtl.seatHold);
});

test('batch checkout creates one session with total amount and bookingIds', async () => {
    let request;
    const stripe = {
        checkout: {
            sessions: {
                create: async (payload) => {
                    request = payload;
                    return { id: 'cs_test_batch', url: 'https://checkout.stripe.test/batch' };
                },
            },
        },
    };
    const bookings = [
        { _id: 'booking-1', amount: 10 },
        { _id: 'booking-2', amount: 15.5 },
    ];
    const result = await createBatchCheckoutSession({
        bookings,
        origin: 'http://localhost:5173',
        userId: 'user-1',
    }, stripe);

    assert.equal(result.url, 'https://checkout.stripe.test/batch');
    assert.equal(request.line_items.length, 1);
    assert.equal(request.line_items[0].price_data.unit_amount, 2550);
    assert.equal(request.metadata.bookingIds, 'booking-1,booking-2');
    assert.equal(request.client_reference_id, 'batch:user-1');
});

test('Stripe session failures stay classifiable without mutating booking state', async () => {
    const stripe = {
        checkout: {
            sessions: {
                create: async () => {
                    throw Object.assign(new Error('temporary Stripe outage'), {
                        type: 'StripeAPIError',
                        requestId: 'req_test_failure',
                    });
                },
            },
        },
    };
    const booking = {
        _id: 'booking-1',
        amount: 10,
        user: 'user-1',
        status: 'pending',
        isPaid: false,
    };

    await assert.rejects(
        createBookingCheckoutSession({
            booking,
            origin: 'http://localhost:5173',
            userId: 'user-1',
        }, stripe),
        (error) => getPaymentErrorStatus(error) === 502,
    );
    assert.equal(booking.status, 'pending');
    assert.equal(booking.isPaid, false);
});
