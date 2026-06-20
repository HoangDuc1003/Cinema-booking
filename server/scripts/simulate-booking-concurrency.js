const required = ['CONCURRENCY_BASE_URL', 'CONCURRENCY_SHOW_ID', 'CONCURRENCY_AUTH_TOKEN'];
const missing = required.filter((name) => !process.env[name]);

if (process.env.CONCURRENCY_TEST_CONFIRM !== 'I_UNDERSTAND') {
    console.error('Refusing to mutate an API. Set CONCURRENCY_TEST_CONFIRM=I_UNDERSTAND and use a disposable test show.');
    process.exit(2);
}
if (missing.length) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    process.exit(2);
}

const attempts = Math.max(2, Number.parseInt(process.env.CONCURRENCY_ATTEMPTS || '10', 10));
const seat = process.env.CONCURRENCY_SEAT || 'H18';
const endpoint = `${process.env.CONCURRENCY_BASE_URL.replace(/\/$/, '')}/api/booking/create`;

const request = async (index) => {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.CONCURRENCY_AUTH_TOKEN}`,
        },
        body: JSON.stringify({ showId: process.env.CONCURRENCY_SHOW_ID, selectedSeats: [seat] }),
    });
    const body = await response.json().catch(() => ({}));
    return { index, status: response.status, bookingId: body.bookingId, message: body.message };
};

const results = await Promise.all(Array.from({ length: attempts }, (_, index) => request(index)));
const winners = results.filter((result) => result.bookingId);
const conflicts = results.filter((result) => result.status === 409);

console.table(results);
console.log({ attempts, winners: winners.length, conflicts: conflicts.length, seat });
if (winners.length !== 1) process.exitCode = 1;
