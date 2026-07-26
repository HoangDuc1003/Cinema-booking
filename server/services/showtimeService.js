export const SHOWTIME_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const SHOWTIME_UTC_OFFSET = '+07:00';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOWTIME_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

export const getShowtimeDateKey = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new RangeError('Invalid showtime date.');

    const parts = Object.fromEntries(
        dateFormatter
            .formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
};

export const parseCinemaShowDateTime = (date, time) => {
    const dateValue = String(date || '').trim();
    const timeValue = String(time || '').trim();
    if (!DATE_PATTERN.test(dateValue) || !TIME_PATTERN.test(timeValue)) {
        throw new RangeError('Show date and time must use YYYY-MM-DD and HH:mm.');
    }

    const showDateTime = new Date(`${dateValue}T${timeValue}:00${SHOWTIME_UTC_OFFSET}`);
    if (Number.isNaN(showDateTime.getTime())) throw new RangeError('Invalid show date and time.');
    return showDateTime;
};

export const groupPersistedShowtimes = (shows = []) => {
    const grouped = {};
    const sortedShows = [...shows].sort(
        (left, right) => new Date(left.showDateTime).getTime() - new Date(right.showDateTime).getTime(),
    );

    for (const show of sortedShows) {
        const showDateTime = new Date(show.showDateTime);
        if (Number.isNaN(showDateTime.getTime())) continue;
        const dateKey = getShowtimeDateKey(showDateTime);
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push({
            showId: String(show._id),
            time: showDateTime.toISOString(),
            price: Number(show.showPrice),
            hall: String(show.hall || 'Standard Hall'),
            isVirtual: false,
        });
    }

    return grouped;
};
