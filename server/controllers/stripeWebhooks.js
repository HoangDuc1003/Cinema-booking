import Stripe from 'stripe';
import Booking from '../models/Booking.js';

// POST /api/webhooks/stripe - Handle Stripe payment events
export const stripeWebhooks = async (req, res) => {
    if (!process.env.STRIPE_SECRET_KEY) {
        console.error('[Stripe Webhook] STRIPE_SECRET_KEY not configured');
        return res.status(500).json({ error: 'Stripe not configured' });
    }

    const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];

    let event;
    try {
        event = stripeInstance.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
        return res.status(400).send(`Webhook error: ${error.message}`);
    }

    try {
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            const sessionList = await stripeInstance.checkout.sessions.list({
                payment_intent: paymentIntent.id
            });
            const session = sessionList.data[0];
            const { bookingId, bookingIds } = session.metadata;
            
            if (bookingIds) {
                // Handle multiple bookings from "Pay All"
                const ids = bookingIds.split(',');
                await Booking.updateMany(
                    { _id: { $in: ids } }, 
                    { isPaid: true, paymentLink: "" }
                );
            } else if (bookingId) {
                // Handle single booking
                await Booking.findByIdAndUpdate(bookingId, { isPaid: true, paymentLink: "" });
            }
        }
        res.status(200).json({ received: true });
    } catch (error) {
        console.error("Webhook processing error:", error);
        res.status(500).json({ error: error.message });
    }
}