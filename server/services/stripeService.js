import Stripe from 'stripe';
import { RuntimeConfigError, requireStripeSecret, requireStripeWebhookSecret } from '../configs/runtimeConfig.js';
import { redisTtl } from './redisKeys.js';

let stripeClient;
let stripeClientKey;

export class PaymentAmountError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PaymentAmountError';
        this.code = 'INVALID_PAYMENT_AMOUNT';
        this.statusCode = 400;
    }
}

export const getStripeClient = (env = process.env) => {
    const secret = requireStripeSecret(env);
    if (!stripeClient || stripeClientKey !== secret) {
        stripeClient = new Stripe(secret);
        stripeClientKey = secret;
    }
    return stripeClient;
};

export const getStripeWebhookSecret = (env = process.env) => requireStripeWebhookSecret(env);

export const toStripeUnitAmount = (amount) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new PaymentAmountError('Booking amount must be a positive finite number.');
    }
    const cents = Math.round(numericAmount * 100);
    if (cents < 50) throw new PaymentAmountError('Booking amount must be at least 50 cents.');
    return cents;
};

export const getSafeStripeError = (error) => ({
    name: error?.name,
    type: error?.type,
    code: error?.code,
    statusCode: error?.statusCode,
    message: error?.message,
    requestId: error?.requestId,
});

export const getPaymentErrorStatus = (error) => {
    if (error instanceof RuntimeConfigError) return 503;
    if (error instanceof PaymentAmountError) return 400;
    if (error?.type || error?.requestId || error?.rawType || error?.name?.startsWith('Stripe')) return 502;
    return error?.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
};

export const getPaymentErrorCode = (error) => {
    if (error instanceof RuntimeConfigError) return 'PAYMENT_CONFIG_UNAVAILABLE';
    if (error instanceof PaymentAmountError) return 'INVALID_PAYMENT_AMOUNT';
    if (getPaymentErrorStatus(error) === 502) return 'PAYMENT_PROVIDER_UNAVAILABLE';
    return 'PAYMENT_SESSION_FAILED';
};

const checkoutExpiry = () => Math.floor(Date.now() / 1000) + redisTtl.seatHold;

export const createBookingCheckoutSession = async (
    { booking, movieTitle, origin, userId },
    stripe = getStripeClient(),
) => {
    return stripe.checkout.sessions.create({
        success_url: `${origin}/loading/my-bookings`,
        cancel_url: `${origin}/my-bookings`,
        client_reference_id: booking._id.toString(),
        line_items: [{
            price_data: {
                currency: 'usd',
                product_data: { name: movieTitle || 'NitroCine Ticket' },
                unit_amount: toStripeUnitAmount(booking.amount),
            },
            quantity: 1,
        }],
        mode: 'payment',
        metadata: {
            bookingId: booking._id.toString(),
            userId: String(userId || booking.user),
        },
        expires_at: checkoutExpiry(),
    });
};

export const createBatchCheckoutSession = async (
    { bookings, origin, userId },
    stripe = getStripeClient(),
) => {
    const totalAmount = bookings.reduce((sum, booking) => sum + Number(booking.amount), 0);
    return stripe.checkout.sessions.create({
        success_url: `${origin}/loading/my-bookings`,
        cancel_url: `${origin}/my-bookings`,
        client_reference_id: `batch:${String(userId)}`,
        line_items: [{
            price_data: {
                currency: 'usd',
                product_data: {
                    name: 'NitroCine Multiple Tickets',
                    description: `Payment for ${bookings.length} movie bookings.`,
                },
                unit_amount: toStripeUnitAmount(totalAmount),
            },
            quantity: 1,
        }],
        mode: 'payment',
        metadata: {
            bookingIds: bookings.map((booking) => booking._id.toString()).join(','),
            userId: String(userId),
        },
        expires_at: checkoutExpiry(),
    });
};

export const buildPaymentRetryPayload = ({ booking, message, error = null }) => ({
    success: false,
    code: getPaymentErrorCode(error),
    bookingId: booking._id,
    holdExpiresAt: booking.holdExpiresAt,
    retryPayment: true,
    retryEndpoint: '/api/booking/pay-now',
    message,
});
